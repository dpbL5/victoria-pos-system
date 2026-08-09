// ── Use-cases: Quản lý nhân viên tham gia ca ─────
import { err, ok } from '@/lib/shared/result'
import type { DomainError, Result } from '@/lib/shared/result'
import { runInTransaction } from '@/lib/infrastructure/db-helpers'
import type { HttpErrorInfo } from '@/lib/infrastructure/api-helpers'
import type { Repositories } from '@/lib/infrastructure/repositories'
import { repositories } from '@/lib/infrastructure/repositories'
import type { OpenShiftDetail } from '../ports'

// ── Add participant ──
export interface AddShiftParticipantInput {
  shiftId: string
  staffId: string
  role: 'LEAD' | 'STAFF'
  targetStaffId: string
}

export interface AddShiftParticipantResult {
  shift: OpenShiftDetail
}

export async function addShiftParticipant(
  input: AddShiftParticipantInput,
  deps: Repositories = repositories
): Promise<Result<AddShiftParticipantResult>> {
  const shift = await deps.shift.findByIdForClose(input.shiftId)
  if (!shift) return err('SHIFT_NOT_FOUND')
  if (shift.status !== 'OPEN') return err('SHIFT_NOT_OPEN')

  const staff = await deps.user.findById(input.targetStaffId)
  if (!staff || !staff.isActive) return err('STAFF_NOT_FOUND')

  const result = await runInTransaction(async (tx) => {
    await tx.shift.upsertParticipant(input.shiftId, input.targetStaffId)

    // upsertParticipant đặt role STAFF — nếu role được chỉ định LEAD, set lại
    if (input.role === 'LEAD') {
      await tx.shift.update(input.shiftId, {
        participants: {
          updateMany: {
            where: { staffId: input.targetStaffId, leftAt: null },
            data: { role: 'LEAD' },
          },
        },
      })
    }

    await tx.audit.append({
      userId: input.staffId,
      action: 'SHIFT_PARTICIPANT_UPSERT',
      entityType: 'Shift',
      entityId: input.shiftId,
      details: {
        staffId: input.targetStaffId,
        staffName: staff.fullName,
        username: staff.username,
        role: input.role,
      },
    })

    return tx.shift.findByIdOrThrow(input.shiftId)
  })

  if (!result.ok) return result
  return ok({ shift: result.value })
}

export function mapAddShiftParticipantError(error: DomainError): HttpErrorInfo {
  switch (error.code) {
    case 'SHIFT_NOT_FOUND':
      return { code: 'SHIFT_NOT_FOUND', message: 'Không tìm thấy ca làm', status: 404 }
    case 'SHIFT_NOT_OPEN':
      return { code: 'SHIFT_NOT_OPEN', message: 'Chỉ quản lý nhân viên khi ca đang mở', status: 400 }
    case 'STAFF_NOT_FOUND':
      return { code: 'STAFF_NOT_FOUND', message: 'Nhân viên không tồn tại hoặc đã bị khoá', status: 404 }
    default:
      return { code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 }
  }
}

// ── Remove participant ──
export interface RemoveShiftParticipantInput {
  shiftId: string
  staffId: string
  targetStaffId: string
}

export interface RemoveShiftParticipantResult {
  shift: OpenShiftDetail
}

export async function removeShiftParticipant(
  input: RemoveShiftParticipantInput,
  deps: Repositories = repositories
): Promise<Result<RemoveShiftParticipantResult>> {
  const shift = await deps.shift.findByIdOrThrow(input.shiftId)
  if (shift.status !== 'OPEN') return err('SHIFT_NOT_OPEN')

  const activeParticipants = shift.participants.filter((p) => p.leftAt === null)
  const target = activeParticipants.find((p) => p.staffId === input.targetStaffId)
  if (!target) return err('PARTICIPANT_NOT_FOUND')
  if (activeParticipants.length <= 1) return err('LAST_PARTICIPANT')

  const result = await runInTransaction(async (tx) => {
    await tx.shift.markParticipantsLeft(input.shiftId, new Date())

    await tx.audit.append({
      userId: input.staffId,
      action: 'SHIFT_PARTICIPANT_REMOVE',
      entityType: 'Shift',
      entityId: input.shiftId,
      details: {
        staffId: input.targetStaffId,
        staffName: target.staff?.fullName ?? '',
        leftAt: new Date().toISOString(),
      },
    })

    return tx.shift.findByIdOrThrow(input.shiftId)
  })

  if (!result.ok) return result
  return ok({ shift: result.value })
}

export function mapRemoveShiftParticipantError(error: DomainError): HttpErrorInfo {
  switch (error.code) {
    case 'SHIFT_NOT_FOUND':
      return { code: 'SHIFT_NOT_FOUND', message: 'Không tìm thấy ca làm', status: 404 }
    case 'SHIFT_NOT_OPEN':
      return { code: 'SHIFT_NOT_OPEN', message: 'Chỉ quản lý nhân viên khi ca đang mở', status: 400 }
    case 'PARTICIPANT_NOT_FOUND':
      return { code: 'PARTICIPANT_NOT_FOUND', message: 'Nhân viên không ở trong ca đang mở', status: 404 }
    case 'LAST_PARTICIPANT':
      return { code: 'LAST_PARTICIPANT', message: 'Ca đang mở cần ít nhất một nhân viên', status: 400 }
    default:
      return { code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 }
  }
}
