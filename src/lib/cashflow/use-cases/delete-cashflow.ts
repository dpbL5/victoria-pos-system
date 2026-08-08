// ── Use-case: deleteCashflow — xoá khoản thu/chi ─────
import { err, ok } from '@/lib/shared/result'
import type { DomainError, Result } from '@/lib/shared/result'
import { runInTransaction } from '@/lib/infrastructure/db-helpers'
import type { Repositories } from '@/lib/infrastructure/repositories'
import { repositories } from '@/lib/infrastructure/repositories'
import type { HttpErrorInfo } from '@/lib/infrastructure/api-helpers'

export interface DeleteCashflowInput {
  id: string
  staffId: string
  fullName: string
}

export interface DeleteCashflowResult {
  deletedId: string
}

export async function deleteCashflow(
  input: DeleteCashflowInput,
  deps: Repositories = repositories
): Promise<Result<DeleteCashflowResult>> {
  // Pre-tx check — nếu không tìm thấy thì return err không cần transaction
  const existing = await deps.cashflow.findById(input.id)
  if (!existing) return err('CASHFLOW_NOT_FOUND')

  const result = await runInTransaction(async (tx) => {
    await tx.cashflow.delete(input.id)

    await tx.audit.append({
      userId: input.staffId,
      action: 'CASHFLOW_DELETE',
      entityType: 'CashflowEntry',
      entityId: input.id,
      details: {
        deletedBy: { userId: input.staffId, fullName: input.fullName },
        deleted: {
          type: existing.type,
          personName: existing.personName,
          amount: Number(existing.amount),
          reason: existing.reason,
          createdAt: existing.createdAt.toISOString(),
        },
      },
    })

    return input.id
  })

  if (!result.ok) return result
  return ok({ deletedId: result.value })
}

export function mapDeleteCashflowError(error: DomainError): HttpErrorInfo {
  switch (error.code) {
    case 'CASHFLOW_NOT_FOUND':
      return { code: 'CASHFLOW_NOT_FOUND', message: 'Không tìm thấy khoản thu chi', status: 404 }
    default:
      return { code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 }
  }
}
