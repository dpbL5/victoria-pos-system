// ── Use-case: closeShift — đóng ca quầy ─────
import { err, ok } from '@/lib/shared/result'
import type { DomainError, Result } from '@/lib/shared/result'
import { runInTransaction } from '@/lib/infrastructure/db-helpers'
import type { Repositories } from '@/lib/infrastructure/repositories'
import { repositories } from '@/lib/infrastructure/repositories'
import type { HttpErrorInfo } from '@/lib/infrastructure/api-helpers'
import type { ToolCountEntry } from '../validations'

export interface CloseShiftInput {
  shiftId: string
  staffId: string
  staffRole: 'ADMIN' | 'STAFF'
  username: string
  fullName: string
  closingCash: number
  notes?: string
  toolCounts?: ToolCountEntry[]
}

export interface CloseShiftResult {
  id: string
  status: 'CLOSED'
  closedAt: Date
  closingCash: number
  expectedCash: number
  cashDifference: number
  notes: string | null
  staff: { id: string; fullName: string } | null
  participants: Array<{
    id: string
    role: 'LEAD' | 'STAFF'
    joinedAt: Date
    leftAt: Date | null
    staff: { id: string; fullName: string }
  }>
}

export async function closeShift(
  input: CloseShiftInput,
  deps: Repositories = repositories
): Promise<Result<CloseShiftResult>> {
  const { shiftId, staffId, staffRole, username, fullName, closingCash, notes, toolCounts } = input

  // Validation trước transaction → return err
  const shift = await deps.shift.findByIdForClose(shiftId)
  if (!shift) return err('SHIFT_NOT_FOUND')
  if (shift.status !== 'OPEN') return err('SHIFT_ALREADY_CLOSED')

  const isActiveParticipant = shift.participants.some(
    (participant) => participant.staffId === staffId
  )
  if (staffRole !== 'ADMIN' && shift.staffId !== staffId && !isActiveParticipant) {
    return err('FORBIDDEN')
  }

  const closedAt = new Date()

  const result = await runInTransaction(async (tx) => {
    const expectedCash = await tx.shift.calculateExpectedCash(shiftId)
    const cashDifference = closingCash - expectedCash

    await tx.shift.markParticipantsLeft(shiftId, closedAt)

    if (toolCounts && toolCounts.length > 0) {
      for (const tc of toolCounts) {
        await tx.shift.upsertToolCloseCount(shiftId, tc.toolId, tc.openCount)
      }
    }

    const closedShift = await tx.shift.close(shiftId, {
      closedAt,
      closingCash,
      expectedCash,
      cashDifference,
      notes,
    })

    await tx.audit.append({
      userId: staffId,
      action: 'SHIFT_CLOSE',
      entityType: 'Shift',
      entityId: shiftId,
      details: {
        closedBy: {
          userId: staffId,
          username,
          fullName,
          role: staffRole,
        },
        expectedCash,
        closingCash,
        cashDifference,
        closedAt: closedAt.toISOString(),
      },
    })

    return closedShift
  })

  if (!result.ok) return result
  const updated = result.value
  return ok({
    ...updated,
    closingCash: Number(updated.closingCash),
    expectedCash: Number(updated.expectedCash),
    cashDifference: Number(updated.cashDifference),
  } as CloseShiftResult)
}

export function mapCloseShiftError(error: DomainError): HttpErrorInfo {
  switch (error.code) {
    case 'SHIFT_NOT_FOUND':
      return { code: 'SHIFT_NOT_FOUND', message: 'Không tìm thấy ca làm', status: 404 }
    case 'SHIFT_ALREADY_CLOSED':
      return { code: 'SHIFT_ALREADY_CLOSED', message: 'Ca làm đã đóng', status: 400 }
    case 'FORBIDDEN':
      return { code: 'FORBIDDEN', message: 'Không có quyền đóng ca này', status: 403 }
    default:
      return { code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 }
  }
}
