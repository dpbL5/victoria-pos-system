// ── Use-case: updateUser — cập nhật tài khoản nhân viên ─────
import { err, ok } from '@/lib/shared/result'
import type { DomainError, Result } from '@/lib/shared/result'
import { runInTransaction } from '@/lib/infrastructure/db-helpers'
import type { HttpErrorInfo } from '@/lib/infrastructure/api-helpers'
import type { Repositories } from '@/lib/infrastructure/repositories'
import { repositories } from '@/lib/infrastructure/repositories'
import type { UserListItem } from '../ports'

export interface UpdateUserInput {
  staffId: string
  userId: string
  fullName?: string
  role?: 'ADMIN' | 'STAFF'
  isActive?: boolean
}

export interface UpdateUserResult {
  user: UserListItem
}

export async function updateUser(
  input: UpdateUserInput,
  deps: Repositories = repositories
): Promise<Result<UpdateUserResult>> {
  const existing = await deps.user.findById(input.userId)
  if (!existing) return err('USER_NOT_FOUND')

  // Chặn vô hiệu hoá nhân viên đang tham gia ca mở
  if (input.isActive === false) {
    const activeParticipants = await deps.user.findActiveOpenShiftParticipants(input.userId)
    if (activeParticipants.length > 0) {
      return err('USER_IN_OPEN_SHIFT')
    }
  }

  const result = await runInTransaction(async (tx) => {
    const user = await tx.user.update(
      input.userId,
      {
        ...(input.fullName !== undefined ? { fullName: input.fullName } : {}),
        ...(input.role !== undefined ? { role: input.role } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      }
    )

    await tx.audit.append({
      userId: input.staffId,
      action: 'USER_UPDATE',
      entityType: 'User',
      entityId: input.userId,
      details: {
        targetUsername: existing.username,
        before: {
          fullName: existing.fullName,
          role: existing.role,
          isActive: existing.isActive,
        },
        after: {
          fullName: user.fullName,
          role: user.role,
          isActive: user.isActive,
        },
      },
    })

    return user
  })

  if (!result.ok) return result
  return ok({ user: result.value })
}

export function mapUpdateUserError(error: DomainError): HttpErrorInfo {
  switch (error.code) {
    case 'USER_NOT_FOUND':
      return { code: 'USER_NOT_FOUND', message: 'Không tìm thấy người dùng', status: 404 }
    case 'USER_IN_OPEN_SHIFT':
      return {
        code: 'USER_IN_OPEN_SHIFT',
        message: 'Không thể vô hiệu hoá nhân viên đang trong ca làm. Vui lòng đưa nhân viên rời ca trước khi khoá tài khoản.',
        status: 409,
      }
    default:
      return { code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 }
  }
}
