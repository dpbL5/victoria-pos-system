// ── Use-case: logToolCount — ghi lại số lượng dụng cụ trong ca ─────
import { err, ok } from '@/lib/shared/result'
import type { DomainError, Result } from '@/lib/shared/result'
import { runInTransaction } from '@/lib/infrastructure/db-helpers'
import type { HttpErrorInfo } from '@/lib/infrastructure/api-helpers'
import type { Repositories } from '@/lib/infrastructure/repositories'
import { repositories } from '@/lib/infrastructure/repositories'
import type { ToolCountEntry } from '../validations'

export interface LogToolCountInput {
  shiftId: string
  staffId: string
  username: string
  fullName: string
  role: 'ADMIN' | 'STAFF'
  toolCounts: ToolCountEntry[]
}

export interface LogToolCountResult {
  shiftId: string
  countedAt: string
  toolCounts: ToolCountEntry[]
}

/**
 * Ghi số lượng dụng cụ đầu ca vào ShiftTool.openCount + ActivityLog (kèm người đếm).
 * Mỗi ca chỉ được đếm MỘT lần: nếu đã có bất kỳ openCount > 0 nào → TOOL_COUNT_ALREADY.
 * Dữ liệu openCount được dùng khi đóng ca để đối soát với closeCount.
 */
export async function logToolCount(
  input: LogToolCountInput,
  deps: Repositories = repositories
): Promise<Result<LogToolCountResult>> {
  const { shiftId, staffId, username, fullName, role, toolCounts } = input

  if (toolCounts.length === 0) return err('TOOL_COUNT_EMPTY')

  // Validate trước transaction → return err
  const shift = await deps.shift.findByIdAccess(shiftId)
  if (!shift) return err('SHIFT_NOT_FOUND')
  if (shift.status !== 'OPEN') return err('SHIFT_ALREADY_CLOSED')

  const isActiveParticipant = shift.participants.some(
    (participant) => participant.staffId === staffId
  )
  if (role !== 'ADMIN' && shift.staffId !== staffId && !isActiveParticipant) {
    return err('FORBIDDEN')
  }

  const alreadyCounted = await deps.shift.findByIdWithToolStats(shiftId)
  if (alreadyCounted?.toolCounts.some((tc) => tc.openCount > 0)) {
    return err('TOOL_COUNT_ALREADY')
  }

  const countedAt = new Date()

  const result = await runInTransaction(async (tx) => {
    for (const tc of toolCounts) {
      await tx.shift.upsertToolOpenCount(shiftId, tc.toolId, tc.openCount)
    }

    await tx.audit.append({
      userId: staffId,
      action: 'TOOL_COUNT',
      entityType: 'Shift',
      entityId: shiftId,
      details: {
        countedBy: {
          userId: staffId,
          username,
          fullName,
          role,
        },
        counts: toolCounts,
        countedAt: countedAt.toISOString(),
      },
    })

    return { shiftId, countedAt: countedAt.toISOString(), toolCounts }
  })

  if (!result.ok) return result
  return ok(result.value)
}

export function mapLogToolCountError(error: DomainError): HttpErrorInfo {
  switch (error.code) {
    case 'SHIFT_NOT_FOUND':
      return { code: 'SHIFT_NOT_FOUND', message: 'Không tìm thấy ca làm', status: 404 }
    case 'SHIFT_ALREADY_CLOSED':
      return { code: 'SHIFT_ALREADY_CLOSED', message: 'Ca làm đã đóng', status: 400 }
    case 'FORBIDDEN':
      return { code: 'FORBIDDEN', message: 'Không có quyền ghi số dụng cụ cho ca này', status: 403 }
    case 'TOOL_COUNT_EMPTY':
      return { code: 'TOOL_COUNT_EMPTY', message: 'Chưa có số liệu dụng cụ', status: 400 }
    case 'TOOL_COUNT_ALREADY':
      return { code: 'TOOL_COUNT_ALREADY', message: 'Ca đã đếm dụng cụ rồi, không thể đếm lại', status: 400 }
    default:
      return { code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 }
  }
}
