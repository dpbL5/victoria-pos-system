// ── Use-case: listRoles — danh sách vai trò + số user đang dùng ─────
import { ok } from '@/lib/shared/result'
import type { Result } from '@/lib/shared/result'
import type { Repositories } from '@/lib/infrastructure/repositories'
import { repositories } from '@/lib/infrastructure/repositories'
import type { RoleListItem } from '../ports'

export interface RoleSummary {
  id: string
  key: string | null
  name: string
  description: string | null
  locked: boolean
  permissions: string[]
  userCount: number
}

export function toRoleSummary(role: RoleListItem): RoleSummary {
  return {
    id: role.id,
    key: role.key,
    name: role.name,
    description: role.description,
    locked: role.locked,
    permissions: role.permissions.map((p) => p.permission),
    userCount: role._count.users,
  }
}

export async function listRoles(
  deps: Repositories = repositories
): Promise<Result<RoleSummary[]>> {
  const roles = await deps.role.findMany()
  return ok(roles.map(toRoleSummary))
}
