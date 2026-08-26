// ── Use-case: retailSale — bán lẻ (nước/dịch vụ) không gắn phiên, thu tiền ngay ─────
import { err, ok } from '@/lib/shared/result'
import type { DomainError, Result } from '@/lib/shared/result'
import { fail, runInTransaction } from '@/lib/infrastructure/db-helpers'
import type { Repositories } from '@/lib/infrastructure/repositories'
import { repositories } from '@/lib/infrastructure/repositories'
import type { HttpErrorInfo } from '@/lib/infrastructure/api-helpers'
import { generateInvoiceNo } from '../helpers'
import type { PaymentMethod } from '@/types'

export interface RetailSaleLineInput {
  productId: string
  quantity: number
}

export interface RetailSaleInput {
  staffId: string
  /** Khách chọn (hội viên/vãng lai đã lưu) — null = khách vãng lai không tạo hồ sơ */
  customerId?: string | null
  items: RetailSaleLineInput[]
  paymentMethod: PaymentMethod
  notes?: string
}

export interface RetailSaleResult {
  invoiceId: string
  invoiceNo: string
  grandTotal: number
  paymentId: string
}

export async function retailSale(
  input: RetailSaleInput,
  deps: Repositories = repositories
): Promise<Result<RetailSaleResult>> {
  const { staffId, customerId, items, paymentMethod, notes } = input

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

  const lines = products.map((product) => {
    const quantity = quantityByProductId.get(product.id) ?? 0
    return {
      productId: product.id,
      type: product.type,
      description: product.name,
      quantity,
      unitPrice: Number(product.price),
      unitCost: product.costPrice !== null ? Number(product.costPrice) : null,
      subtotal: quantity * Number(product.price),
    }
  })

  const grandTotal = lines.reduce((sum, line) => sum + line.subtotal, 0)

  const result = await runInTransaction(async (tx) => {
    // ── Kiểm tra ca làm trong transaction để tránh TOCTOU race ──
    const openShift = await tx.shift.findOpenForStaff(staffId)
    if (!openShift) fail('SHIFT_REQUIRED')

    const shiftId = openShift.id

    // Tạo invoice PAID — không gắn phiên (sessionId null)
    const invoice = await tx.billing.createPaidInvoice({
      invoiceNo: generateInvoiceNo('INV'),
      customerId: customerId ?? null,
      shiftId,
      staffId,
      paidAt: new Date(),
      notes: notes ?? 'Bán lẻ không phiên',
      subtotal: grandTotal,
      discountTotal: 0,
      grandTotal,
      lines: [],
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
        // Snapshot giá vốn (weighted average cost) tại thời điểm bán
        unitCost: latestProduct.costPrice !== null ? Number(latestProduct.costPrice) : null,
        subtotal: line.subtotal,
        discountAmount: 0,
        total: line.subtotal,
      })

      // ── Trừ kho (PRODUCT only) ──
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
          unitCost: latestProduct.costPrice !== null ? Number(latestProduct.costPrice) : null,
          reason: 'Bán lẻ không phiên',
        })
      }
    }

    const payment = await tx.billing.createPayment({
      invoiceId: invoice.id,
      sessionId: null,
      shiftId,
      staffId,
      totalHours: 0,
      subtotal: grandTotal,
      discountTotal: 0,
      grandTotal,
      paymentMethod,
      paidAt: new Date(),
      notes: notes ?? 'Bán lẻ không phiên',
    })

    // Tích luỹ chi tiêu nếu chọn khách (hội viên/vãng lai đã lưu)
    if (customerId) {
      await tx.customer.addSpend(customerId, grandTotal)
    }

    await tx.audit.append({
      userId: staffId,
      action: 'RETAIL_SALE',
      entityType: 'Invoice',
      entityId: invoice.id,
      details: {
        invoiceNo: invoice.invoiceNo,
        shiftId,
        customerId: customerId ?? null,
        paymentId: payment.id,
        grandTotal,
        itemCount: lines.length,
      },
    })

    return { invoice, payment }
  })

  if (!result.ok) return result
  return ok({
    invoiceId: result.value.invoice.id,
    invoiceNo: result.value.invoice.invoiceNo,
    grandTotal,
    paymentId: result.value.payment.id,
  })
}

export function mapRetailSaleError(error: DomainError): HttpErrorInfo {
  switch (error.code) {
    case 'NO_ITEMS':
      return { code: 'NO_ITEMS', message: 'Chưa chọn sản phẩm để bán', status: 400 }
    case 'PRODUCT_NOT_FOUND':
      return { code: 'PRODUCT_NOT_FOUND', message: 'Có sản phẩm không tồn tại hoặc đã ngừng bán', status: 400 }
    case 'PRODUCT_UNAVAILABLE':
      return { code: 'PRODUCT_UNAVAILABLE', message: 'Có sản phẩm không còn bán', status: 400 }
    case 'INSUFFICIENT_STOCK':
      return { code: 'INSUFFICIENT_STOCK', message: `${error.detail ?? 'Sản phẩm'} không đủ tồn kho`, status: 400 }
    case 'SHIFT_REQUIRED':
      return { code: 'SHIFT_REQUIRED', message: 'Cần mở hoặc tham gia ca trước khi bán lẻ', status: 409 }
    default:
      return { code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 }
  }
}
