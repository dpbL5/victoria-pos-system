// ── Use-case: updateCashflow — sửa khoản thu/chi ─────
import { err, ok } from '@/lib/shared/result'
import type { DomainError, Result } from '@/lib/shared/result'
import { runInTransaction } from '@/lib/infrastructure/db-helpers'
import type { Repositories } from '@/lib/infrastructure/repositories'
import { repositories } from '@/lib/infrastructure/repositories'
import type { HttpErrorInfo } from '@/lib/infrastructure/api-helpers'
import type { CashflowEntryRecord, UpdateCashflowData } from '../ports'

export { type UpdateCashflowData }

export interface UpdateCashflowInput {
  id: string
  staffId: string
  fullName: string
  data: UpdateCashflowData
}

export interface UpdateCashflowResult {
  cashflow: CashflowEntryRecord
}

export async function updateCashflow(
  input: UpdateCashflowInput,
  deps: Repositories = repositories
): Promise<Result<UpdateCashflowResult>> {
  // Pre-tx check
  const existing = await deps.cashflow.findById(input.id)
  if (!existing) return err('CASHFLOW_NOT_FOUND')

  const result = await runInTransaction(async (tx) => {
    const updated = await tx.cashflow.update(input.id, input.data)

    await tx.audit.append({
      userId: input.staffId,
      action: 'CASHFLOW_UPDATE',
      entityType: 'CashflowEntry',
      entityId: input.id,
      details: {
        editedBy: { userId: input.staffId, fullName: input.fullName },
        before: {
          type: existing.type,
          personName: existing.personName,
          amount: Number(existing.amount),
          reason: existing.reason,
        },
        after: {
          type: input.data.type,
          personName: input.data.personName,
          amount: input.data.amount,
          reason: input.data.reason,
        },
      },
    })

    return updated
  })

  if (!result.ok) return result
  return ok({ cashflow: result.value })
}

export function mapUpdateCashflowError(error: DomainError): HttpErrorInfo {
  switch (error.code) {
    case 'CASHFLOW_NOT_FOUND':
      return { code: 'CASHFLOW_NOT_FOUND', message: 'Không tìm thấy khoản thu chi', status: 404 }
    default:
      return { code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 }
  }
}
