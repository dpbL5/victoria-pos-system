// ── Use-case: createCashflow — thêm khoản thu/chi ─────
import { err, ok } from '@/lib/shared/result'
import type { DomainError, Result } from '@/lib/shared/result'
import { runInTransaction } from '@/lib/infrastructure/db-helpers'
import type { HttpErrorInfo } from '@/lib/infrastructure/api-helpers'
import type { CashflowEntryRecord, CreateCashflowData } from '../ports'

export { type CreateCashflowData }

export interface CreateCashflowResult {
  cashflow: CashflowEntryRecord
}

export async function createCashflow(
  input: CreateCashflowData
): Promise<Result<CreateCashflowResult>> {
  const result = await runInTransaction(async (tx) => {
    const cashflow = await tx.cashflow.create(input)

    await tx.audit.append({
      userId: input.staffId,
      action: 'CASHFLOW_CREATE',
      entityType: 'CashflowEntry',
      entityId: cashflow.id,
      details: {
        type: input.type,
        personName: input.personName,
        amount: Number(cashflow.amount),
        reason: input.reason,
        createdAt: cashflow.createdAt.toISOString(),
      },
    })

    return cashflow
  })

  if (!result.ok) return result
  return ok({ cashflow: result.value })
}

export function mapCreateCashflowError(error: DomainError): HttpErrorInfo {
  return {
    code: error.code || 'UNKNOWN',
    message: error.detail || 'Không thêm được khoản thu chi',
    status: 500,
  }
}
