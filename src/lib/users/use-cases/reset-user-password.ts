// ── Use-case: resetUserPassword — đặt lại mật khẩu ─────
import { err, ok } from '@/lib/shared/result'
import type { DomainError, Result } from '@/lib/shared/result'
import { runInTransaction } from '@/lib/infrastructure/db-helpers'
import type { HttpErrorInfo } from '@/lib/infrastructure/api-helpers'
import type { Repositories } from '@/lib/infrastructure/repositories'
import { repositories } from '@/lib/infrastructure/repositories'
import bcrypt from 'bcryptjs'

export interface ResetUserPasswordInput {
  staffId: string
  userId: string
  newPassword: string
}

export interface ResetUserPasswordResult {
  userId: string
}

export async function resetUserPassword(
  input: ResetUserPasswordInput,
  deps: Repositories = repositories
): Promise<Result<ResetUserPasswordResult>> {
  const existing = await deps.user.findById(input.userId)
  if (!existing) return err('USER_NOT_FOUND')

  const passwordHash = await bcrypt.hash(input.newPassword, 12)

  const result = await runInTransaction(async (tx) => {
    await tx.user.update(input.userId, { passwordHash })

    await tx.audit.append({
      userId: input.staffId,
      action: 'USER_PASSWORD_RESET',
      entityType: 'User',
      entityId: input.userId,
      details: {
        targetUsername: existing.username,
        targetFullName: existing.fullName,
      },
    })

    return { userId: input.userId }
  })

  if (!result.ok) return result
  return ok({ userId: result.value.userId })
}

export function mapResetUserPasswordError(error: DomainError): HttpErrorInfo {
  switch (error.code) {
    case 'USER_NOT_FOUND':
      return { code: 'USER_NOT_FOUND', message: 'Không tìm thấy người dùng', status: 404 }
    default:
      return { code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 }
  }
}
