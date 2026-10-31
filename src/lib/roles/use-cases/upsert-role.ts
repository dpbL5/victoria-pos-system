// ── Use-case: createRole / updateRole ─────
import { err, ok } from '@/lib/shared/result'
import type { DomainError, Result } from '@/lib/shared/result'
import { runInTransaction } from '@/lib/infrastructure/db-helpers'
import type { HttpErrorInfo } from '@/lib/infrastructure/api-helpers'
import type { Repositories } from '@/lib/infrastructure/repositories'
import { repositories } from '@/lib/infrastructure/repositories'
import { filterValidPermissions, isValidPermission } from '../permissions'
import { toRoleSummary, type RoleSummary } from './list-roles'

/** API input là trust boundary — từ chối khóa quyền lạ thay vì lặng lẽ bỏ qua */
function validatePermissions(keys: readonly string[]): Result<never> | null {
  const invalid = keys.filter((k) => !isValidPermission(k))
  if (invalid.length > 0) return err('PERMISSION_INVALID')
  return null
}

export interface CreateRoleInput {
  staffId: string
  name: string
  description?: string | null
  permissions: string[]
}

export interface UpdateRoleInput {
  staffId: string
  roleId: string
  name?: string
  description?: string | null
  permissions?: string[]
}

export async function createRole(
  input: CreateRoleInput,
  deps: Repositories = repositories
): Promise<Result<RoleSummary>> {
  const invalid = validatePermissions(input.permissions)
  if (invalid) return invalid
  const permissions = filterValidPermissions(input.permissions)

  const result = await runInTransaction(async (tx) => {
    const role = await tx.role.create({
      name: input.name,
      description: input.description ?? null,
      permissions,
    })

    await tx.audit.append({
      userId: input.staffId,
      action: 'ROLE_CREATE',
      entityType: 'Role',
      entityId: role.id,
      details: {
        name: role.name,
        permissions,
      },
    })

    return role
  })

  if (!result.ok) return result
  return ok(toRoleSummary(result.value))
}

export async function updateRole(
  input: UpdateRoleInput,
  deps: Repositories = repositories
): Promise<Result<RoleSummary>> {
  const existing = await deps.role.findById(input.roleId)
  if (!existing) return err('ROLE_NOT_FOUND')
  // Role hệ thống ADMIN khoá cứng — không sửa
  if (existing.locked) return err('ROLE_LOCKED')

  if (input.permissions !== undefined) {
    const invalid = validatePermissions(input.permissions)
    if (invalid) return invalid
  }
  const permissions =
    input.permissions !== undefined ? filterValidPermissions(input.permissions) : undefined

  const result = await runInTransaction(async (tx) => {
    const role = await tx.role.update(input.roleId, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(permissions !== undefined ? { permissions } : {}),
    })

    await tx.audit.append({
      userId: input.staffId,
      action: 'ROLE_UPDATE',
      entityType: 'Role',
      entityId: input.roleId,
      details: {
        name: role.name,
        before: {
          name: existing.name,
          permissions: existing.permissions.map((p) => p.permission),
        },
        after: {
          name: role.name,
          permissions: role.permissions.map((p) => p.permission),
        },
      },
    })

    return role
  })

  if (!result.ok) return result
  return ok(toRoleSummary(result.value))
}

export function mapCreateRoleError(error: DomainError): HttpErrorInfo {
  switch (error.code) {
    case 'PERMISSION_INVALID':
      return { code: 'PERMISSION_INVALID', message: 'Có quyền không hợp lệ trong danh sách', status: 400 }
    default:
      return { code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 }
  }
}

export function mapUpdateRoleError(error: DomainError): HttpErrorInfo {
  switch (error.code) {
    case 'ROLE_NOT_FOUND':
      return { code: 'ROLE_NOT_FOUND', message: 'Không tìm thấy vai trò', status: 404 }
    case 'ROLE_LOCKED':
      return { code: 'ROLE_LOCKED', message: 'Vai trò quản trị viên không thể chỉnh sửa', status: 403 }
    default:
      return { code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 }
  }
}
