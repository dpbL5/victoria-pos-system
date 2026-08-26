// ── Use-case: createUser — tạo tài khoản nhân viên ─────
import { err, ok } from '@/lib/shared/result'
import type { DomainError, Result } from '@/lib/shared/result'
import { runInTransaction } from '@/lib/infrastructure/db-helpers'
import type { HttpErrorInfo } from '@/lib/infrastructure/api-helpers'
import type { Repositories } from '@/lib/infrastructure/repositories'
import { repositories } from '@/lib/infrastructure/repositories'
import bcrypt from 'bcryptjs'
import type { UserListItem } from '../ports'

export interface CreateUserInput {
  staffId: string
  username: string
  password: string
  fullName: string
  role: 'ADMIN' | 'MANAGER' | 'STAFF'
}

export interface CreateUserResult {
  user: UserListItem
}

export async function createUser(
  input: CreateUserInput,
  deps: Repositories = repositories
): Promise<Result<CreateUserResult>> {
  const existing = await deps.user.findByUsername(input.username)
  if (existing) return err('USERNAME_EXISTS')

  const passwordHash = await bcrypt.hash(input.password, 12)

  const result = await runInTransaction(async (tx) => {
    const user = await tx.user.create({
      username: input.username,
      passwordHash,
      fullName: input.fullName,
      role: input.role,
    })

    await tx.audit.append({
      userId: input.staffId,
      action: 'USER_CREATE',
      entityType: 'User',
      entityId: user.id,
      details: {
        username: user.username,
        fullName: user.fullName,
        role: user.role,
        isActive: user.isActive,
      },
    })

    return user
  })

  if (!result.ok) return result
  return ok({ user: result.value })
}

export function mapCreateUserError(error: DomainError): HttpErrorInfo {
  switch (error.code) {
    case 'USERNAME_EXISTS':
      return { code: 'USERNAME_EXISTS', message: 'Tên đăng nhập đã tồn tại', status: 400 }
    default:
      return { code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 }
  }
}
