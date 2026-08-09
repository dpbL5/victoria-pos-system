// ── Use-case: deleteInvoice — xoá hoá đơn chưa có giao dịch liên quan ─────
import { err, ok } from '@/lib/shared/result'
import type { DomainError, Result } from '@/lib/shared/result'
import { runInTransaction, fail } from '@/lib/infrastructure/db-helpers'
import type { HttpErrorInfo } from '@/lib/infrastructure/api-helpers'
import type { Repositories } from '@/lib/infrastructure/repositories'
import { repositories } from '@/lib/infrastructure/repositories'

export interface DeleteInvoiceInput {
  invoiceId: string
  staffId: string
  role: 'ADMIN' | 'STAFF'
}

export interface DeleteInvoiceResult {
  deletedId: string
}

export async function deleteInvoice(
  input: DeleteInvoiceInput,
  deps: Repositories = repositories
): Promise<Result<DeleteInvoiceResult>> {
  if (input.role !== 'ADMIN') return err('FORBIDDEN')

  const existing = await deps.billing.findByIdForDelete(input.invoiceId)
  if (!existing) return err('INVOICE_NOT_FOUND')

  const result = await runInTransaction(async (tx) => {
    const linked = await tx.billing.countLinkedTransactions(input.invoiceId)
    if (linked.payments > 0 || linked.membershipPayments > 0 || linked.stockMovements > 0) {
      fail('INVOICE_LINKED')
    }

    await tx.billing.deleteInvoiceWithItems(input.invoiceId)

    await tx.audit.append({
      userId: input.staffId,
      action: 'INVOICE_DELETE',
      entityType: 'Invoice',
      entityId: input.invoiceId,
      details: {
        invoiceNo: existing.invoiceNo,
        status: existing.status,
        grandTotal: existing.grandTotal,
        staffId: existing.staffId,
        customerId: existing.customerId,
      },
    })

    return { deletedId: input.invoiceId }
  })

  if (!result.ok) return result
  return ok(result.value)
}

export function mapDeleteInvoiceError(error: DomainError): HttpErrorInfo {
  switch (error.code) {
    case 'FORBIDDEN':
      return { code: 'FORBIDDEN', message: 'Chỉ quản trị viên được xoá hoá đơn', status: 403 }
    case 'INVOICE_NOT_FOUND':
      return { code: 'INVOICE_NOT_FOUND', message: 'Không tìm thấy hoá đơn', status: 404 }
    case 'INVOICE_LINKED':
      return {
        code: 'INVOICE_LINKED',
        message:
          'Không thể xoá hoá đơn đã có thanh toán, phí hội viên hoặc biến động tồn kho liên quan. ' +
          'Hãy dùng chức năng huỷ hoá đơn (đặt trạng thái Đã huỷ) thay thế.',
        status: 409,
      }
    default:
      return { code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 }
  }
}
