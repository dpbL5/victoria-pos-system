// ── Roles module — vai trò & phân quyền ─────
export { listRoles, toRoleSummary, type RoleSummary } from './use-cases/list-roles'
export {
  createRole,
  updateRole,
  mapCreateRoleError,
  mapUpdateRoleError,
  type CreateRoleInput,
  type UpdateRoleInput,
} from './use-cases/upsert-role'
export {
  deleteRole,
  mapDeleteRoleError,
  type DeleteRoleInput,
  type DeleteRoleResult,
} from './use-cases/delete-role'
export type { RoleRepository, RoleListItem } from './ports'
export * from './validations'
export * from './permissions'
