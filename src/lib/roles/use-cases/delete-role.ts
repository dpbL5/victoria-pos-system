// ── Use-case: deleteRole — xoá vai trò, gỡ gán user ("Chưa phân vai") ─────
import { err, ok } from '@/lib/shared/result'
import type { DomainError, Result } from '@/lib/shared/result'
import { runInTransaction } from '@/lib/infrastructure/db-helpers'
import type { HttpErrorInfo } from '@/lib/infrastructure/api-helpers'
import type { Repositories } from '@/lib/infrastructure/repositories'
import { repositories } from '@/lib/infrastructure/repositories'

export interface DeleteRoleInput {
  staffId: string
  roleId: string
}

export interface DeleteRoleResult {
  deletedId: string
  /** Số user bị gỡ gán — về trạng thái "Chưa phân vai" */
  usersDetached: number
}

export async function deleteRole(
  input: DeleteRoleInput,
  deps: Repositories = repositories
): Promise<Result<DeleteRoleResult>> {
  const existing = await deps.role.findById(input.roleId)
  if (!existing) return err('ROLE_NOT_FOUND')
  // ADMIN là bảo hiểm hệ thống — không xoá được
  if (existing.locked) return err('ROLE_LOCKED')

  const result = await runInTransaction(async (tx) => {
    // Không có bản ghi tài chính nào tham chiếu Role — user bị gỡ gán giữ
    // nguyên tài khoản + lịch sử, chỉ mất quyền cho đến khi được gán role mới.
    await tx.role.detachUsers(input.roleId)
    await tx.role.remove(input.roleId)

    await tx.audit.append({
      userId: input.staffId,
      action: 'ROLE_DELETE',
      entityType: 'Role',
      entityId: input.roleId,
      details: {
        name: existing.name,
        key: existing.key,
        permissions: existing.permissions.map((p) => p.permission),
      },
    })

    return { deletedId: input.roleId, usersDetached: existing._count.users }
  })

  if (!result.ok) return result
  return ok(result.value)
}

export function mapDeleteRoleError(error: DomainError): HttpErrorInfo {
  switch (error.code) {
    case 'ROLE_NOT_FOUND':
      return { code: 'ROLE_NOT_FOUND', message: 'Không tìm thấy vai trò', status: 404 }
    case 'ROLE_LOCKED':
      return { code: 'ROLE_LOCKED', message: 'Vai trò quản trị viên không thể xoá', status: 403 }
    default:
      return { code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 }
  }
}
