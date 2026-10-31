// ── Re-export permission catalog cho domain roles ─────
// Nguồn thật nằm ở shared để cả backend lẫn frontend dùng chung một catalog.
export {
  PERMISSION_GROUPS,
  ALL_PERMISSIONS,
  PERMISSION_KEY_SET,
  isValidPermission,
  filterValidPermissions,
  hasPermission,
  hasAnyPermission,
  groupPermissionKeys,
  moduleAccessible,
  isSuperuserRole,
  firstAccessibleModuleRoute,
  hasPageAccess,
} from '@/lib/shared/permissions'
export type { PermissionDef, NavModule, PermissionGroupDef } from '@/lib/shared/permissions'
