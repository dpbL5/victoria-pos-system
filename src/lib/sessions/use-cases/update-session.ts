// ── Use-case: updateSession — cập nhật phiên (pause/cancel...) ─────
import { err, ok } from '@/lib/shared/result'
import type { DomainError, Result } from '@/lib/shared/result'
import { runInTransaction, fail } from '@/lib/infrastructure/db-helpers'
import type { HttpErrorInfo } from '@/lib/infrastructure/api-helpers'
import type { Repositories } from '@/lib/infrastructure/repositories'
import { repositories } from '@/lib/infrastructure/repositories'
import type { Prisma } from '@/generated/prisma/client'

export interface UpdateSessionInput {
  sessionId: string
  staffId: string
  role: 'ADMIN' | 'STAFF'
  data: Prisma.SessionUncheckedUpdateInput
  notes?: string | null
}

export interface UpdateSessionResult {
  session: Prisma.SessionGetPayload<{
    include: { customer: { select: { id: true; fullName: true } } }
  }>
}

export async function updateSession(
  input: UpdateSessionInput,
  deps: Repositories = repositories
): Promise<Result<UpdateSessionResult>> {
  const existing = await deps.session.findByIdWithCustomer(input.sessionId)
  if (!existing) return err('SESSION_NOT_FOUND')

  // IDOR: STAFF chỉ sửa được phiên mình tạo hoặc trong ca mình tham gia
  if (input.role !== 'ADMIN') {
    const isOwner = existing.staffId === input.staffId
    const isParticipant = existing.shiftId
      ? Boolean(await deps.shift.findByIdAccess(existing.shiftId))
      : false
    if (!isOwner && !isParticipant) return err('FORBIDDEN')
  }

  // Chặn sửa phiên đã COMPLETED (chỉ cho phép huỷ phiên ACTIVE)
  if (existing.status === 'COMPLETED') return err('CANNOT_EDIT_COMPLETED')

  // Chặn chuyển CANCELLED về ACTIVE
  if (existing.status === 'CANCELLED' && input.data.status === 'ACTIVE') return err('CANNOT_REACTIVATE')

  const result = await runInTransaction(async (tx) => {
    await tx.session.update(input.sessionId, input.data)

    const session = await tx.session.findByIdWithCustomer(input.sessionId)
    if (!session) fail('SESSION_NOT_FOUND')

    await tx.audit.append({
      userId: input.staffId,
      action: input.data.status === 'CANCELLED' ? 'SESSION_CANCEL' : 'SESSION_UPDATE',
      entityType: 'Session',
      entityId: input.sessionId,
      details: {
        previousStatus: existing.status,
        newStatus: session.status,
        notes: input.notes ?? null,
      },
    })

    return session
  })

  if (!result.ok) return result
  return ok({ session: result.value })
}

export function mapUpdateSessionError(error: DomainError): HttpErrorInfo {
  switch (error.code) {
    case 'SESSION_NOT_FOUND':
      return { code: 'SESSION_NOT_FOUND', message: 'Không tìm thấy phiên', status: 404 }
    case 'FORBIDDEN':
      return { code: 'FORBIDDEN', message: 'Không có quyền truy cập phiên này', status: 403 }
    case 'CANNOT_EDIT_COMPLETED':
      return { code: 'CANNOT_EDIT_COMPLETED', message: 'Không thể sửa phiên đã kết thúc', status: 400 }
    case 'CANNOT_REACTIVATE':
      return { code: 'CANNOT_REACTIVATE', message: 'Không thể kích hoạt lại phiên đã hủy', status: 400 }
    default:
      return { code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 }
  }
}
