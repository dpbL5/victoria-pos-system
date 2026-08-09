// ── Use-case: adjustShiftCashDifference — điều chỉnh lệch tiền ca đã đóng ─────
import { err, ok } from '@/lib/shared/result'
import type { DomainError, Result } from '@/lib/shared/result'
import { runInTransaction } from '@/lib/infrastructure/db-helpers'
import type { HttpErrorInfo } from '@/lib/infrastructure/api-helpers'
import type { Repositories } from '@/lib/infrastructure/repositories'
import { repositories } from '@/lib/infrastructure/repositories'

export interface AdjustShiftCashDifferenceInput {
  shiftId: string
  staffId: string
  cashDifference: number
  notes?: string
}

export interface AdjustShiftCashDifferenceResult {
  id: string
  cashDifference: number
  notes: string | null
  updatedAt: Date
}

export async function adjustShiftCashDifference(
  input: AdjustShiftCashDifferenceInput,
  deps: Repositories = repositories
): Promise<Result<AdjustShiftCashDifferenceResult>> {
  const shift = await deps.shift.findByIdExport(input.shiftId)
  if (!shift) return err('SHIFT_NOT_FOUND')
  if (shift.status !== 'CLOSED') return err('SHIFT_NOT_CLOSED')

  const result = await runInTransaction(async (tx) => {
    const updated = await tx.shift.adjustCashDifference(input.shiftId, {
      cashDifference: input.cashDifference,
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    })

    await tx.audit.append({
      userId: input.staffId,
      action: 'SHIFT_CASH_ADJUST',
      entityType: 'Shift',
      entityId: input.shiftId,
      details: {
        previousDifference: Number(shift.openedAt instanceof Date ? 0 : 0),
        newDifference: input.cashDifference,
        notes: input.notes ?? null,
      },
    })

    return updated
  })

  if (!result.ok) return result
  return ok(result.value)
}

export function mapAdjustShiftCashDifferenceError(error: DomainError): HttpErrorInfo {
  switch (error.code) {
    case 'SHIFT_NOT_FOUND':
      return { code: 'SHIFT_NOT_FOUND', message: 'Không tìm thấy ca làm', status: 404 }
    case 'SHIFT_NOT_CLOSED':
      return { code: 'SHIFT_NOT_CLOSED', message: 'Chỉ điều chỉnh được ca đã đóng', status: 400 }
    default:
      return { code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 }
  }
}
