// ── Use-case: sellItems — thêm sản phẩm/dịch vụ bán kèm vào phiên (chưa tạo hóa đơn) ─────
import { err, ok } from '@/lib/shared/result'
import type { DomainError, Result } from '@/lib/shared/result'
import { fail, runInTransaction } from '@/lib/infrastructure/db-helpers'
import type { Repositories } from '@/lib/infrastructure/repositories'
import { repositories } from '@/lib/infrastructure/repositories'
import type { HttpErrorInfo } from '@/lib/infrastructure/api-helpers'
import type { CheckoutLine } from './checkout-types'
import { diffSellItems, type SellItemStockDelta } from '../sell-item-diff'

/**
 * Bù tồn kho cho phần chênh lệch số lượng của dòng bán kèm.
 * Dòng bán kèm đã trừ kho lúc thêm vào phiên nên ở đây chỉ bù phần lệch; bỏ hẳn
 * dòng cũng đi qua đây (delta âm bằng đúng số đã bán → kho được hoàn trọn vẹn).
 * Dùng chung cho lưu-khi-đóng-drawer và checkout — hai đường ghi phải bù kho
 * giống nhau, nếu không tồn kho phụ thuộc vào đường nào được gọi.
 */
export async function applySellItemStockDeltas(
  tx: Repositories,
  input: {
    deltas: SellItemStockDelta[]
    productTypeById: Map<string, string>
    productNameById: Map<string, string>
    sessionId: string
    staffId: string
    shiftId: string
  },
): Promise<void> {
  const { deltas, productTypeById, productNameById, sessionId, staffId, shiftId } = input
  for (const { productId, delta } of deltas) {
    if (delta === 0) continue
    if (productTypeById.get(productId) !== 'PRODUCT') continue
    if (delta > 0) {
      const stockUpdate = await tx.product.decrementStockIfAvailable(productId, delta)
      if (stockUpdate.count === 0) {
        fail('INSUFFICIENT_STOCK', productNameById.get(productId))
      }
      await tx.product.recordSaleMovement({
        productId,
        invoiceItemId: null,
        shiftId,
        staffId,
        quantity: delta,
        reason: `Bán kèm phiên ${sessionId}`,
      })
    } else {
      await tx.billing.reverseStock({
        invoiceItemId: null,
        productId,
        shiftId,
        staffId,
        quantity: -delta,
        reason: `Điều chỉnh bán kèm phiên ${sessionId}`,
      })
    }
  }
}

export interface SellLineInput {
  productId: string
  quantity: number
}

export interface SellItemsInput {
  sessionId: string
  staffId: string
  items: SellLineInput[]
  notes?: string
}

export interface SellItemsResult {
  sessionId: string
  itemCount: number
  grandTotal: number
}

export async function sellItems(
  input: SellItemsInput,
  deps: Repositories = repositories
): Promise<Result<SellItemsResult>> {
  const { sessionId, staffId, items, notes } = input

  // ── Guard trước transaction ──
  const session = await deps.session.findByIdWithCustomer(sessionId)
  if (!session) return err('SESSION_NOT_FOUND')
  if (session.status !== 'ACTIVE') {
    return err(session.status === 'COMPLETED' ? 'SESSION_COMPLETED' : 'SESSION_CANCELLED')
  }

  if (items.length === 0) return err('NO_ITEMS')

  const quantityByProductId = new Map<string, number>()
  for (const item of items) {
    quantityByProductId.set(
      item.productId,
      (quantityByProductId.get(item.productId) ?? 0) + item.quantity
    )
  }

  const productIds = Array.from(quantityByProductId.keys())
  const products = productIds.length > 0
    ? await deps.product.findManyByIds(productIds)
    : []

  if (products.length !== productIds.length) return err('PRODUCT_NOT_FOUND')

  const lines: CheckoutLine[] = products.map((product) => {
    const quantity = quantityByProductId.get(product.id) ?? 0
    return {
      productId: product.id,
      type: product.type,
      description: product.name,
      quantity,
      unitPrice: Number(product.price),
      subtotal: quantity * Number(product.price),
    }
  })

  const grandTotal = lines.reduce((sum, line) => sum + line.subtotal, 0)

  const result = await runInTransaction(async (tx) => {
    // ── Kiểm tra ca làm trong transaction để tránh TOCTOU race ──
    const openShift = await tx.shift.findOpenIdForStaff(staffId)
    if (!openShift) fail('SHIFT_REQUIRED')

    // ── Ghi dòng bán kèm tạm (chưa phải hóa đơn) + trừ kho ngay ──
    const latestProducts = await tx.product.findManyByIds(productIds)
    const latestProductsById = new Map(latestProducts.map((product) => [product.id, product]))
    for (const line of lines) {
      const latestProduct = latestProductsById.get(line.productId)
      if (!latestProduct) {
        fail('PRODUCT_UNAVAILABLE')
      }

      await tx.session.addSellItem({
        sessionId,
        productId: latestProduct.id,
        quantity: line.quantity,
        unitPrice: Number(latestProduct.price),
        notes: notes ?? null,
      })

      if (latestProduct.type === 'PRODUCT') {
        const stockUpdate = await tx.product.decrementStockIfAvailable(latestProduct.id, line.quantity)
        if (stockUpdate.count === 0) {
          fail('INSUFFICIENT_STOCK', latestProduct.name)
        }

        await tx.product.recordSaleMovement({
          productId: latestProduct.id,
          invoiceItemId: null,
          shiftId: openShift.id,
          staffId,
          quantity: line.quantity,
          reason: `Bán kèm phiên ${sessionId}`,
        })
      }
    }

    await tx.audit.append({
      userId: staffId,
      action: 'SESSION_SELL',
      entityType: 'Session',
      entityId: sessionId,
      details: {
        shiftId: openShift.id,
        grandTotal,
        itemCount: lines.length,
        note: 'Thêm dòng bán kèm vào phiên (chưa thanh toán)',
      },
    })

    return { itemCount: lines.length }
  })

  if (!result.ok) return result
  return ok({
    sessionId,
    itemCount: result.value.itemCount,
    grandTotal,
  })
}

export interface RemoveSellItemsInput {
  sessionId: string
  staffId: string
  itemIds: string[]
}

export interface RemoveSellItemsResult {
  removedCount: number
}

/**
 * Xoá các dòng bán kèm chưa checkout khỏi phiên và hoàn kho tương ứng.
 * Chỉ được xoá khi phiên còn ACTIVE (hàng chờ thu chưa được tính tiền).
 */
export async function removeSellItems(
  input: RemoveSellItemsInput,
  deps: Repositories = repositories
): Promise<Result<RemoveSellItemsResult>> {
  const { sessionId, staffId, itemIds } = input
  if (itemIds.length === 0) return err('NO_ITEMS')

  const session = await deps.session.findByIdWithCustomer(sessionId)
  if (!session) return err('SESSION_NOT_FOUND')
  if (session.status !== 'ACTIVE') {
    return err(session.status === 'COMPLETED' ? 'SESSION_COMPLETED' : 'SESSION_CANCELLED')
  }

  const result = await runInTransaction(async (tx) => {
    const openShift = await tx.shift.findOpenIdForStaff(staffId)
    if (!openShift) fail('SHIFT_REQUIRED')

    // Chỉ xoá các dòng thuộc đúng phiên này
    const rows = await tx.session.findSellItems(sessionId)
    const toRemove = rows.filter((r) => itemIds.includes(r.id))
    if (toRemove.length === 0) fail('SELL_ITEM_NOT_FOUND')

    // Hoàn kho các dòng là sản phẩm (PRODUCT) — SERVICE không trừ kho
    const productIds = Array.from(new Set(toRemove.map((r) => r.productId)))
    const products = productIds.length > 0 ? await tx.product.findManyByIds(productIds) : []
    const productTypeById = new Map(products.map((p) => [p.id, p.type]))
    // Hoàn kho các dòng là sản phẩm (PRODUCT) — SERVICE không trừ kho
    // Hoàn kho các dòng là sản phẩm (PRODUCT) — SERVICE không trừ kho
    for (const row of toRemove) {
      if (productTypeById.get(row.productId) !== 'PRODUCT') continue
      await tx.billing.reverseStock({
        invoiceItemId: null,
        productId: row.productId,
        shiftId: openShift.id,
        staffId,
        quantity: row.quantity,
        reason: `Huỷ bán kèm phiên ${sessionId}`,
      })
    }

    await tx.session.removeSellItems(toRemove.map((r) => r.id))

    await tx.audit.append({
      userId: staffId,
      action: 'SESSION_SELL_REMOVE',
      entityType: 'Session',
      entityId: sessionId,
      details: {
        shiftId: openShift.id,
        removedCount: toRemove.length,
        removedSellItemIds: toRemove.map((r) => r.id),
      },
    })

    return { removedCount: toRemove.length }
  })

  if (!result.ok) return result
  return ok(result.value)
}

export interface SyncSessionSellItemsInput {
  sessionId: string
  staffId: string
  /** Danh sách hàng CUỐI CÙNG của phiếu (rỗng = phiếu không còn dòng nào) */
  items: SellLineInput[]
}

export interface SyncSessionSellItemsResult {
  sessionId: string
  itemCount: number
  grandTotal: number
}

/**
 * Đặt danh sách hàng chờ thu của phiên đúng bằng `items` — dùng khi nhân viên
 * sửa hàng hoá trong drawer checkout rồi đóng drawer. Không tạo hoá đơn.
 *
 * Khác `sellItems` (chỉ cộng thêm): ở đây hoà giải cả ba chiều — thêm, sửa số
 * lượng, bỏ dòng — và bù kho theo đúng phần chênh lệch. Giá của dòng đã có
 * giữ nguyên giá đã chốt; hàng mới lấy giá hiện tại.
 */
export async function syncSessionSellItems(
  input: SyncSessionSellItemsInput,
  deps: Repositories = repositories,
): Promise<Result<SyncSessionSellItemsResult>> {
  const { sessionId, staffId, items } = input

  const session = await deps.session.findByIdWithCustomer(sessionId)
  if (!session) return err('SESSION_NOT_FOUND')
  if (session.status !== 'ACTIVE') {
    return err(session.status === 'COMPLETED' ? 'SESSION_COMPLETED' : 'SESSION_CANCELLED')
  }

  const desired = new Map<string, number>()
  for (const item of items) {
    if (item.quantity <= 0) continue
    desired.set(item.productId, (desired.get(item.productId) ?? 0) + item.quantity)
  }

  const result = await runInTransaction(async (tx) => {
    const openShift = await tx.shift.findOpenIdForStaff(staffId)
    if (!openShift) fail('SHIFT_REQUIRED')

    const existing = await tx.session.findSellItems(sessionId)
    const diff = diffSellItems(existing, desired)

    // Tra sản phẩm một lần: dùng cho cả bù kho lẫn tạo dòng mới
    const productIds = Array.from(
      new Set([
        ...diff.stockDeltas.map((delta) => delta.productId),
        ...diff.newQuantities.keys(),
        ...diff.lines.map((line) => line.productId),
      ]),
    )
    const products = productIds.length > 0 ? await tx.product.findManyByIds(productIds) : []
    if (products.length !== productIds.length) fail('PRODUCT_NOT_FOUND')
    const productById = new Map(products.map((product) => [product.id, product]))

    await applySellItemStockDeltas(tx, {
      deltas: diff.stockDeltas,
      productTypeById: new Map(products.map((p) => [p.id, p.type])),
      productNameById: new Map(products.map((p) => [p.id, p.name])),
      sessionId,
      staffId,
      shiftId: openShift.id,
    })

    for (const line of diff.lines) {
      const original = existing.find((item) => item.id === line.id)
      if (original && original.quantity !== line.quantity) {
        await tx.session.updateSellItemQuantity(line.id, line.quantity)
      }
    }

    if (diff.removedIds.length > 0) {
      await tx.session.removeSellItems(diff.removedIds)
    }

    let itemCount = diff.lines.length
    let grandTotal = diff.lines.reduce(
      (sum, line) => sum + line.quantity * line.unitPrice,
      0,
    )

    // Hàng mới: tạo dòng bán kèm + trừ kho toàn bộ (giá hiện tại)
    for (const [productId, quantity] of diff.newQuantities) {
      const product = productById.get(productId)
      if (!product) fail('PRODUCT_NOT_FOUND')
      const unitPrice = Number(product.price)
      await tx.session.addSellItem({ sessionId, productId, quantity, unitPrice })
      if (product.type === 'PRODUCT') {
        const stockUpdate = await tx.product.decrementStockIfAvailable(productId, quantity)
        if (stockUpdate.count === 0) fail('INSUFFICIENT_STOCK', product.name)
        await tx.product.recordSaleMovement({
          productId,
          invoiceItemId: null,
          shiftId: openShift.id,
          staffId,
          quantity,
          reason: `Bán kèm phiên ${sessionId}`,
        })
      }
      itemCount += 1
      grandTotal += quantity * unitPrice
    }

    await tx.audit.append({
      userId: staffId,
      action: 'SESSION_SELL_SYNC',
      entityType: 'Session',
      entityId: sessionId,
      details: {
        shiftId: openShift.id,
        itemCount,
        grandTotal,
        addedProductIds: Array.from(diff.newQuantities.keys()),
        removedSellItemIds: diff.removedIds,
        note: 'Đặt lại danh sách hàng chờ thu của phiên khi đóng màn thu tiền',
      },
    })

    return { sessionId, itemCount, grandTotal }
  })

  if (!result.ok) return result
  return ok(result.value)
}

export function mapSyncSessionSellItemsError(error: DomainError): HttpErrorInfo {
  switch (error.code) {
    case 'SESSION_NOT_FOUND':
      return { code: 'SESSION_NOT_FOUND', message: 'Không tìm thấy phiên', status: 404 }
    case 'SESSION_COMPLETED':
      return { code: 'SESSION_COMPLETED', message: 'Phiên đã kết thúc rồi', status: 400 }
    case 'SESSION_CANCELLED':
      return { code: 'SESSION_CANCELLED', message: 'Phiên đã bị hủy rồi', status: 400 }
    case 'PRODUCT_NOT_FOUND':
      return { code: 'PRODUCT_NOT_FOUND', message: 'Có sản phẩm không tồn tại hoặc đã ngừng bán', status: 400 }
    case 'INSUFFICIENT_STOCK':
      return { code: 'INSUFFICIENT_STOCK', message: `${error.detail ?? 'Sản phẩm'} không đủ tồn kho`, status: 400 }
    case 'SHIFT_REQUIRED':
      return { code: 'SHIFT_REQUIRED', message: 'Cần mở hoặc tham gia ca trước khi sửa hàng hoá', status: 409 }
    default:
      return { code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 }
  }
}

export function mapSellItemsError(error: DomainError): HttpErrorInfo {
  switch (error.code) {
    case 'SESSION_NOT_FOUND':
      return { code: 'SESSION_NOT_FOUND', message: 'Không tìm thấy phiên', status: 404 }
    case 'SESSION_COMPLETED':
      return { code: 'SESSION_COMPLETED', message: 'Phiên đã kết thúc rồi', status: 400 }
    case 'SESSION_CANCELLED':
      return { code: 'SESSION_CANCELLED', message: 'Phiên đã bị hủy rồi', status: 400 }
    case 'NO_ITEMS':
      return { code: 'NO_ITEMS', message: 'Chưa chọn sản phẩm để thêm vào phiên', status: 400 }
    case 'PRODUCT_NOT_FOUND':
      return { code: 'PRODUCT_NOT_FOUND', message: 'Có sản phẩm không tồn tại hoặc đã ngừng bán', status: 400 }
    case 'PRODUCT_UNAVAILABLE':
      return { code: 'PRODUCT_UNAVAILABLE', message: 'Có sản phẩm không còn bán', status: 400 }
    case 'INSUFFICIENT_STOCK':
      return { code: 'INSUFFICIENT_STOCK', message: `${error.detail ?? 'Sản phẩm'} không đủ tồn kho`, status: 400 }
    case 'SHIFT_REQUIRED':
      return { code: 'SHIFT_REQUIRED', message: 'Cần mở hoặc tham gia ca trước khi thêm vào phiên', status: 409 }
    default:
      return { code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 }
  }
}

export function mapRemoveSellItemsError(error: DomainError): HttpErrorInfo {
  switch (error.code) {
    case 'SESSION_NOT_FOUND':
      return { code: 'SESSION_NOT_FOUND', message: 'Không tìm thấy phiên', status: 404 }
    case 'SESSION_COMPLETED':
      return { code: 'SESSION_COMPLETED', message: 'Phiên đã kết thúc rồi', status: 400 }
    case 'SESSION_CANCELLED':
      return { code: 'SESSION_CANCELLED', message: 'Phiên đã bị hủy rồi', status: 400 }
    case 'NO_ITEMS':
      return { code: 'NO_ITEMS', message: 'Chưa chọn dòng bán kèm để xoá', status: 400 }
    case 'SELL_ITEM_NOT_FOUND':
      return { code: 'SELL_ITEM_NOT_FOUND', message: 'Dòng bán kèm không tồn tại trong phiên', status: 404 }
    case 'SHIFT_REQUIRED':
      return { code: 'SHIFT_REQUIRED', message: 'Cần mở hoặc tham gia ca trước khi xoá dòng bán kèm', status: 409 }
    default:
      return { code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 }
  }
}
