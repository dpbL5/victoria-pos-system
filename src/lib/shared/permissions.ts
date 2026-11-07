// ── Permission catalog — nguồn duy nhất cho guard API, page guard, nav và UI cấu hình ─────
// Quyền là tập hợp khóa cố định trong code (kiểu Discord): role chỉ là tổ hợp các khóa.
// Thêm quyền mới = sửa file này, không cần migration DB.

export interface PermissionDef {
  key: string
  label: string
}

/** Module điều hướng đại diện cho nhóm — dùng chung cho nav (sidebar/bottom bar) và page guard */
export interface NavModule {
  route: string
  label: string
}

export interface PermissionGroupDef {
  /** Prefix của nhóm, vd 'pricing' cho pricing.* */
  key: string
  label: string
  /** Module điều hướng — nhóm không có trang riêng (vd invoices) để undefined */
  module?: NavModule
  permissions: PermissionDef[]
}

export const PERMISSION_GROUPS: PermissionGroupDef[] = [
  {
    key: 'sessions',
    label: 'POS — Phiên chơi',
    module: { route: '/sessions', label: 'Ca hôm nay' },
    permissions: [
      { key: 'sessions.view', label: 'Xem phiên chơi & board' },
      { key: 'sessions.checkin', label: 'Check-in / tạo phiên' },
      { key: 'sessions.checkout', label: 'Checkout & thu tiền' },
      { key: 'sessions.sell', label: 'Bán sản phẩm / dịch vụ trong phiên' },
      { key: 'sessions.retail', label: 'Bán lẻ tại quầy' },
      { key: 'sessions.staffDrink', label: 'Nhận nước / hàng dùng nội bộ' },
      { key: 'sessions.edit', label: 'Sửa phiên (giờ, số người chơi...)' },
      { key: 'sessions.monitor', label: 'Xem board chỉ-đọc khi không có ca riêng' },
      { key: 'tools.count', label: 'Đếm dụng cụ' },
    ],
  },
  {
    key: 'bookings',
    label: 'Đặt lịch',
    module: { route: '/bookings', label: 'Lịch đặt' },
    permissions: [
      { key: 'bookings.view', label: 'Xem lịch đặt' },
      { key: 'bookings.create', label: 'Tạo lịch đặt (thu cọc)' },
      { key: 'bookings.confirm', label: 'Xác nhận / check-in lịch đặt' },
      { key: 'bookings.cancel', label: 'Huỷ lịch đặt' },
    ],
  },
  {
    key: 'customers',
    label: 'Khách hàng',
    module: { route: '/customers', label: 'Khách hàng' },
    permissions: [
      { key: 'customers.view', label: 'Xem khách hàng' },
      { key: 'customers.create', label: 'Thêm khách hàng' },
      { key: 'customers.edit', label: 'Sửa khách hàng' },
      { key: 'customers.delete', label: 'Xoá khách hàng' },
    ],
  },
  {
    key: 'memberships',
    label: 'Hội viên',
    // Cùng trang với khách hàng — nhóm không có trang riêng
    permissions: [
      { key: 'memberships.register', label: 'Đăng ký hội viên' },
      { key: 'memberships.renew', label: 'Gia hạn hội viên' },
      { key: 'memberships.backdate', label: 'Ghi nhận thanh toán hội viên lùi ngày' },
      { key: 'memberships.plans.manage', label: 'Quản lý gói hội viên' },
    ],
  },
  {
    key: 'products',
    label: 'Sản phẩm / Dịch vụ',
    module: { route: '/inventory', label: 'Kho' },
    permissions: [
      { key: 'products.view', label: 'Xem sản phẩm / dịch vụ' },
      { key: 'products.create', label: 'Thêm sản phẩm / dịch vụ' },
      { key: 'products.edit', label: 'Sửa sản phẩm / dịch vụ' },
      { key: 'products.delete', label: 'Xoá sản phẩm / dịch vụ' },
    ],
  },
  {
    key: 'stock',
    label: 'Kho — Tồn kho',
    module: { route: '/inventory', label: 'Kho' },
    permissions: [
      { key: 'stock.view', label: 'Xem tồn kho & lịch sử kho' },
      { key: 'stock.post', label: 'Nhập / điều chỉnh kho' },
    ],
  },
  {
    key: 'invoices',
    label: 'Hoá đơn',
    // Xem qua chi tiết khách hàng / giao dịch — nhóm không có trang riêng
    permissions: [
      { key: 'invoices.view', label: 'Xem hoá đơn' },
      { key: 'invoices.edit', label: 'Sửa hoá đơn đã thanh toán' },
      { key: 'invoices.void', label: 'Huỷ hoá đơn' },
    ],
  },
  {
    key: 'pricing',
    label: 'Bảng giá',
    module: { route: '/pricing', label: 'Bảng giá' },
    permissions: [
      { key: 'pricing.view', label: 'Xem bảng giá' },
      { key: 'pricing.create', label: 'Thêm luật giá' },
      { key: 'pricing.edit', label: 'Sửa luật giá' },
      { key: 'pricing.delete', label: 'Xoá luật giá' },
    ],
  },
  {
    key: 'promotions',
    label: 'Khuyến mại',
    module: { route: '/promotions', label: 'Khuyến mại' },
    permissions: [
      { key: 'promotions.view', label: 'Xem khuyến mại' },
      { key: 'promotions.create', label: 'Thêm khuyến mại' },
      { key: 'promotions.edit', label: 'Sửa khuyến mại' },
      { key: 'promotions.delete', label: 'Xoá khuyến mại' },
    ],
  },
  {
    key: 'tools',
    label: 'Dụng cụ',
    module: { route: '/tools', label: 'Dụng cụ' },
    permissions: [
      { key: 'tools.view', label: 'Xem dụng cụ' },
      { key: 'tools.create', label: 'Thêm dụng cụ' },
      { key: 'tools.edit', label: 'Sửa dụng cụ' },
      { key: 'tools.delete', label: 'Xoá dụng cụ' },
    ],
  },
  {
    key: 'shifts',
    label: 'Ca làm',
    module: { route: '/shifts', label: 'Ca làm' },
    permissions: [
      { key: 'shifts.view', label: 'Xem ca làm' },
      { key: 'shifts.open', label: 'Mở ca' },
      { key: 'shifts.close', label: 'Đóng ca' },
    ],
  },
  {
    key: 'reports',
    label: 'Báo cáo',
    module: { route: '/reports', label: 'Báo cáo' },
    permissions: [
      { key: 'reports.view', label: 'Xem báo cáo (phạm vi của mình)' },
      { key: 'reports.viewAll', label: 'Xem báo cáo toàn hệ thống' },
      { key: 'reports.export', label: 'Xuất CSV báo cáo' },
    ],
  },
  {
    key: 'cashflows',
    label: 'Thu chi',
    module: { route: '/cashflow', label: 'Thu chi' },
    permissions: [
      { key: 'cashflows.view', label: 'Xem thu chi' },
      { key: 'cashflows.create', label: 'Thêm khoản thu / chi' },
      { key: 'cashflows.edit', label: 'Sửa khoản thu / chi' },
      { key: 'cashflows.delete', label: 'Xoá khoản thu / chi' },
    ],
  },
  {
    key: 'users',
    label: 'Nhân sự',
    module: { route: '/staff', label: 'Nhân viên' },
    permissions: [
      { key: 'users.view', label: 'Xem nhân viên' },
      { key: 'users.create', label: 'Thêm nhân viên' },
      { key: 'users.edit', label: 'Sửa nhân viên' },
      { key: 'users.delete', label: 'Xoá / vô hiệu hoá nhân viên' },
    ],
  },
  {
    key: 'roles',
    label: 'Vai trò & Quyền',
    module: { route: '/roles', label: 'Vai trò' },
    permissions: [
      { key: 'roles.view', label: 'Xem vai trò & quyền' },
      { key: 'roles.manage', label: 'Tạo / sửa / xoá vai trò, gán quyền' },
    ],
  },
  {
    key: 'settings',
    label: 'Cài đặt hệ thống',
    permissions: [{ key: 'settings.edit', label: 'Sửa cài đặt hệ thống' }],
  },
  {
    key: 'students',
    label: 'Học viên',
    module: { route: '/students', label: 'Học viên' },
    permissions: [
      { key: 'students.view', label: 'Xem học viên' },
      { key: 'students.create', label: 'Thêm học viên' },
      { key: 'students.edit', label: 'Sửa học viên' },
      { key: 'students.delete', label: 'Xoá học viên' },
    ],
  },
  {
    key: 'classes',
    label: 'Lớp học',
    module: { route: '/classes', label: 'Lớp học' },
    permissions: [
      { key: 'classes.view', label: 'Xem lớp học' },
      { key: 'classes.create', label: 'Thêm lớp học' },
      { key: 'classes.edit', label: 'Sửa lớp học' },
      { key: 'classes.delete', label: 'Xoá lớp học' },
    ],
  },
  {
    key: 'lessons',
    label: 'Lịch học',
    module: { route: '/lessons', label: 'Lịch học' },
    permissions: [
      { key: 'lessons.view', label: 'Xem lịch học' },
      { key: 'lessons.create', label: 'Tạo buổi học' },
      { key: 'lessons.edit', label: 'Sửa buổi học (đổi giờ, điểm danh...)' },
      { key: 'lessons.delete', label: 'Xoá / huỷ buổi học' },
    ],
  },
  {
    key: 'series',
    label: 'Khung giờ lịch (chuỗi buổi)',
    permissions: [{ key: 'series.manage', label: 'Quản lý khung giờ lặp lại' }],
  },
  {
    key: 'audit',
    label: 'Nhật ký hệ thống',
    permissions: [{ key: 'audit.view', label: 'Xem nhật ký hoạt động' }],
  },
]

/** Toàn bộ khóa quyền hợp lệ — dùng validate khi lưu role */
export const ALL_PERMISSIONS: string[] = PERMISSION_GROUPS.flatMap((g) =>
  g.permissions.map((p) => p.key),
)

export const PERMISSION_KEY_SET: ReadonlySet<string> = new Set(ALL_PERMISSIONS)

export function isValidPermission(key: string): boolean {
  return PERMISSION_KEY_SET.has(key)
}

/** Role admin tự tạo không rỗng thì phải chỉ chứa khóa hợp lệ */
export function filterValidPermissions(keys: readonly string[]): string[] {
  return keys.filter((k) => PERMISSION_KEY_SET.has(k))
}

// ── Helpers thuần — dùng được cả backend lẫn frontend ─────

export function hasPermission(perms: readonly string[] | null | undefined, key: string): boolean {
  return !!perms && perms.includes(key)
}

export function hasAnyPermission(
  perms: readonly string[] | null | undefined,
  keys: readonly string[],
): boolean {
  return !!perms && keys.some((k) => perms.includes(k))
}

/** Danh sách khóa quyền của một nhóm */
export function groupPermissionKeys(groupKey: string): string[] {
  const group = PERMISSION_GROUPS.find((g) => g.key === groupKey)
  return group ? group.permissions.map((p) => p.key) : []
}

/**
 * Quy tắc ẩn nhóm quyền: role không có quyền truy cập BẤT KỲ tính năng nào của nhóm
 * → ẩn hoàn toàn lối tắt nhóm đó trên sidebar và bottom bar.
 * ADMIN bypass (nhóm nào cũng hiện).
 */
export function moduleAccessible(
  perms: readonly string[] | null | undefined,
  groupKey: string,
  roleKey?: string | null,
): boolean {
  if (roleKey === 'ADMIN') return true
  return hasAnyPermission(perms, groupPermissionKeys(groupKey))
}

/** Role hệ thống ADMIN — bypass mọi guard */
export function isSuperuserRole(role: { key?: string | null } | null | undefined): boolean {
  return role?.key === 'ADMIN'
}

/**
 * Check permission có tính bypass ADMIN — dùng chung backend (AuthUser) và
 * frontend (user.role từ /api/auth/me).
 */
export function hasAccess(
  perms: readonly string[] | null | undefined,
  roleKey: string | null | undefined,
  ...keys: readonly string[]
): boolean {
  if (roleKey === 'ADMIN') return true
  return hasAnyPermission(perms, keys)
}

/**
 * Trang đầu tiên user được vào (theo thứ tự nhóm trong catalog) — đích redirect
 * của page guard khi user mở trang không có quyền. undefined = không có module nào.
 */
export function firstAccessibleModuleRoute(
  perms: readonly string[] | null | undefined,
  roleKey?: string | null,
): string | undefined {
  const group = PERMISSION_GROUPS.find((g) => g.module && moduleAccessible(perms, g.key, roleKey))
  return group?.module?.route
}

/** Page guard: user có quyền vào bất kỳ nhóm nào trong danh sách không? */
export function hasPageAccess(
  perms: readonly string[] | null | undefined,
  groupKeys: readonly string[],
  roleKey?: string | null,
): boolean {
  return groupKeys.some((g) => moduleAccessible(perms, g, roleKey))
}
