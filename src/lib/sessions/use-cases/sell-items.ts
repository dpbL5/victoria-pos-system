// ── Use-case: sellItems — thêm sản phẩm/dịch vụ vào phiên (invoice DRAFT) ─────
import { err, ok } from '@/lib/shared/result'
import type { DomainError, Result } from '@/lib/shared/result'
import { fail, runInTransaction } from '@/lib/infrastructure/db-helpers'
import type { Repositories } from '@/lib/infrastructure/repositories'
import { repositories } from '@/lib/infrastructure/repositories'
import type { HttpErrorInfo } from '@/lib/infrastructure/api-helpers'
import { generateInvoiceNo } from '@/lib/invoicing'
import type { CheckoutLine } from './checkout-types'

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
  invoiceId: string
  invoiceNo: string
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
      unitPrice: product.price,
      subtotal: quantity * product.price,
    }
  })

  const grandTotal = lines.reduce((sum, line) => sum + line.subtotal, 0)

  const result = await runInTransaction(async (tx) => {
    // ── Kiểm tra ca làm trong transaction để tránh TOCTOU race ──
    const openShift = await tx.shift.findOpenForStaff(staffId)
    if (!openShift) fail('SHIFT_REQUIRED')

    const shiftId = session.shiftId ?? openShift.id

    // Tạo invoice DRAFT — chưa thanh toán, chưa trừ kho.
    // Khi checkout (thu tiền) mới tạo invoice PAID, trừ kho và thu tiền.
    const invoice = await tx.billing.createDraftInvoice({
      invoiceNo: generateInvoiceNo('SEL'),
      customerId: session.customerId,
      sessionId,
      shiftId,
      staffId,
      subtotal: grandTotal,
      discountTotal: 0,
      grandTotal,
      notes,
    })

    for (const line of lines) {
      const latestProduct = await tx.product.findByIdForSale(line.productId)
      if (!latestProduct || !latestProduct.isActive) {
        fail('PRODUCT_UNAVAILABLE')
      }

      const invoiceItem = await tx.billing.createInvoiceItem({
        invoiceId: invoice.id,
        productId: latestProduct.id,
        type: latestProduct.type,
        description: latestProduct.name,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        subtotal: line.subtotal,
        discountAmount: 0,
        total: line.subtotal,
      })

      // ── Trừ kho ngay khi thêm vào phiên ──
      if (latestProduct.type === 'PRODUCT') {
        const stockUpdate = await tx.product.decrementStockIfAvailable(latestProduct.id, line.quantity)
        if (stockUpdate.count === 0) {
          fail('INSUFFICIENT_STOCK', latestProduct.name)
        }

        await tx.product.recordSaleMovement({
          productId: latestProduct.id,
          invoiceItemId: invoiceItem.id,
          shiftId,
          staffId,
          quantity: line.quantity,
          unitCost: latestProduct.costPrice,
          reason: `Bán kèm phiên ${sessionId}`,
        })
      }
    }

    await tx.audit.append({
      userId: staffId,
      action: 'SESSION_SELL',
      entityType: 'Invoice',
      entityId: invoice.id,
      details: {
        sessionId,
        shiftId,
        grandTotal,
        itemCount: lines.length,
        note: 'Thêm vào phiên (chưa thanh toán)',
      },
    })

    return { invoice }
  })

  if (!result.ok) return result
  return ok({
    invoiceId: result.value.invoice.id,
    invoiceNo: result.value.invoice.invoiceNo,
    grandTotal,
  })
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
