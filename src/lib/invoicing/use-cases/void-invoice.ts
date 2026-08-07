// ── Use-case: voidInvoice — huỷ hoá đơn đã thanh toán ─────
import type { DomainError, Result } from '@/lib/shared/result'
import { fail, runInTransaction } from '@/lib/infrastructure/db-helpers'
import type { Repositories } from '@/lib/infrastructure/repositories'
import type { HttpErrorInfo } from '@/lib/infrastructure/api-helpers'

export interface VoidInvoiceInput {
  invoiceId: string
  staffId: string
  reason?: string
}

export interface VoidInvoiceResult {
  invoiceId: string
  invoiceNo: string
  status: 'CANCELLED'
  reversedStockItems: number
}

/**
 * Huỷ (void) một hoá đơn đã thanh toán.
 *
 * 1. Hoàn trả tồn kho — tạo StockMovement VOID để đảo ngược các lần SALE
 *    (cả items của hoá đơn PAID lẫn các DRAFT invoice đã merge).
 * 2. Đánh dấu hoá đơn thành CANCELLED.
 * 3. Ghi nhật ký kiểm toán.
 *
 * Không tạo payment hoàn trả, không hoàn số dư khách hàng.
 * Báo cáo doanh thu tự lọc các payment từ hoá đơn CANCELLED.
 */
// Không nhận deps: Repositories vì toàn bộ logic nằm trong transaction —
// repos được inject bởi runInTransaction. Unit test gọi trực tiếp runVoidInvoice
// với fake repositories (xem src/lib/__tests__/void-invoice.test.ts).
export async function voidInvoice(
  input: VoidInvoiceInput
): Promise<Result<VoidInvoiceResult>> {
  return runInTransaction((tx) => runVoidInvoice(tx, input))
}

/**
 * Thân transaction — tách riêng để unit test với fake repositories.
 * Lỗi validation trong tx dùng fail() → throw RollbackSignal → rollback.
 */
export async function runVoidInvoice(
  tx: Repositories,
  input: VoidInvoiceInput
): Promise<VoidInvoiceResult> {
  const { invoiceId, staffId, reason } = input

  const invoice = await tx.billing.findVoidTarget(invoiceId)
  if (!invoice) fail('INVOICE_NOT_FOUND')
  if (invoice.status !== 'PAID') fail('INVOICE_NOT_VOIDABLE')
  if (!invoice.shiftId) fail('SHIFT_CLOSED')

  const correctionShiftId = invoice.shiftId
  const actorName = invoice.staff?.fullName ?? staffId
  const note = reason
    ? `Huỷ hoá đơn ${invoice.invoiceNo} bởi ${actorName}: ${reason}`
    : `Huỷ hoá đơn ${invoice.invoiceNo} bởi ${actorName}`
  const timestamp = new Date().toISOString()

  // 1. Hoàn trả tồn kho cho hàng hoá đã bán (đảo ngược StockMovement SALE)
  let reversedStockItems = 0
  for (const item of invoice.items) {
    if (!item.productId) continue
    for (const movement of item.stockMovements) {
      const returnQty = Math.abs(movement.quantity)
      await tx.billing.reverseStock({
        invoiceItemId: item.id,
        productId: movement.productId ?? item.productId,
        shiftId: correctionShiftId,
        staffId,
        quantity: returnQty,
        unitCost: movement.unitCost ?? null,
        reason: note,
      })
      reversedStockItems += returnQty
    }
  }

  // 1b. Hoàn trả tồn kho cho DRAFT invoice đã merge vào hoá đơn này
  if (invoice.sessionId) {
    const draftItems = await tx.billing.findMergedDraftItems(invoice.sessionId, invoice.invoiceNo)
    for (const item of draftItems) {
      if (!item.productId) continue
      for (const movement of item.stockMovements) {
        const returnQty = Math.abs(movement.quantity)
        await tx.billing.reverseStock({
          invoiceItemId: item.id,
          productId: movement.productId ?? item.productId,
          shiftId: correctionShiftId,
          staffId,
          quantity: returnQty,
          unitCost: movement.unitCost ?? null,
          reason: note,
        })
        reversedStockItems += returnQty
      }
    }
  }

  // 2. Đánh dấu hoá đơn là CANCELLED
  const notes = invoice.notes
    ? `${invoice.notes}\n\n${note} (${timestamp})`
    : `${note} (${timestamp})`
  await tx.billing.markInvoiceCancelled(invoiceId, notes)

  // 3. Ghi nhật ký hoạt động
  await tx.audit.append({
    userId: staffId,
    action: 'INVOICE_VOID',
    entityType: 'Invoice',
    entityId: invoiceId,
    details: {
      invoiceNo: invoice.invoiceNo,
      statusBefore: invoice.status,
      statusAfter: 'CANCELLED',
      grandTotal: invoice.grandTotal,
      reversedStockItems,
      reason: reason ?? null,
      shiftId: correctionShiftId,
      actorName,
    },
  })

  return { invoiceId, invoiceNo: invoice.invoiceNo, status: 'CANCELLED', reversedStockItems }
}

export function mapVoidInvoiceError(error: DomainError): HttpErrorInfo {
  switch (error.code) {
    case 'INVOICE_NOT_FOUND':
      return { code: 'INVOICE_NOT_FOUND', message: 'Không tìm thấy hoá đơn', status: 404 }
    case 'INVOICE_NOT_VOIDABLE':
      return { code: 'INVOICE_NOT_VOIDABLE', message: 'Chỉ có thể huỷ hoá đơn đã thanh toán (trạng thái PAID)', status: 409 }
    case 'SHIFT_CLOSED':
      return { code: 'SHIFT_CLOSED', message: 'Hoá đơn chưa gán ca thanh toán, không thể ghi nhận hoàn trả.', status: 409 }
    default:
      return { code: 'SERVER_ERROR', message: 'Lỗi máy chủ', status: 500 }
  }
}
