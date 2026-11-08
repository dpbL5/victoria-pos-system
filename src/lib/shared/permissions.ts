// ── Permission catalog — nguồn duy nhất cho guard API, page guard, nav và UI cấu hình ─────
// Quyền là tập hợp khóa cố định trong code (kiểu Discord): role chỉ là tổ hợp các khóa.
// Thêm quyền mới = sửa file này, không cần migration DB.

export interface PermissionDef {
  key: string
  label: string
  /** Mô tả ngắn chức năng — dùng làm tooltip khi hover nút quyền */
  description: string
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
      { key: 'sessions.view', label: 'Xem phiên chơi & board', description: 'Xem danh sách phiên đang chơi và bảng vận hành Ca hôm nay.' },
      { key: 'sessions.checkin', label: 'Check-in / tạo phiên', description: 'Tạo phiên chơi mới khi khách vào, gồm khách vãng lai và hội viên.' },
      { key: 'sessions.checkout', label: 'Checkout & thu tiền', description: 'Chốt phiên, lập hoá đơn và thu tiền của khách.' },
      { key: 'sessions.sell', label: 'Bán sản phẩm / dịch vụ trong phiên', description: 'Bán sản phẩm hoặc dịch vụ gắn vào phiên đang chơi.' },
      { key: 'sessions.retail', label: 'Bán lẻ tại quầy', description: 'Bán lẻ tại quầy cho khách không có phiên chơi.' },
      { key: 'sessions.staffDrink', label: 'Nhận nước / hàng dùng nội bộ', description: 'Nhận nước hoặc hàng dùng nội bộ cho nhân viên.' },
      { key: 'sessions.edit', label: 'Sửa phiên (giờ, số người chơi...)', description: 'Sửa giờ bắt đầu, số người chơi hoặc thông tin khác của phiên.' },
      { key: 'sessions.monitor', label: 'Xem board chỉ-đọc khi không có ca riêng', description: 'Xem bảng Ca hôm nay ở chế độ chỉ đọc khi không tham gia ca.' },
      { key: 'tools.count', label: 'Đếm dụng cụ', description: 'Nhập số dụng cụ đầu ca và cuối ca để đối soát.' },
    ],
  },
  {
    key: 'bookings',
    label: 'Đặt lịch',
    module: { route: '/bookings', label: 'Lịch đặt' },
    permissions: [
      { key: 'bookings.view', label: 'Xem lịch đặt', description: 'Xem danh sách lịch đặt và lịch sử đặt chỗ.' },
      { key: 'bookings.create', label: 'Tạo lịch đặt (thu cọc)', description: 'Tạo lịch đặt mới và thu tiền cọc.' },
      { key: 'bookings.confirm', label: 'Xác nhận / check-in lịch đặt', description: 'Xác nhận lịch và bắt đầu phiên chơi cho khách đã đặt.' },
      { key: 'bookings.cancel', label: 'Huỷ lịch đặt', description: 'Huỷ lịch đặt, kể cả lịch đã quá giờ hẹn.' },
    ],
  },
  {
    key: 'customers',
    label: 'Khách hàng',
    module: { route: '/customers', label: 'Khách hàng' },
    permissions: [
      { key: 'customers.view', label: 'Xem khách hàng', description: 'Xem danh sách và thông tin khách hàng.' },
      { key: 'customers.create', label: 'Thêm khách hàng', description: 'Thêm hồ sơ khách hàng mới.' },
      { key: 'customers.edit', label: 'Sửa khách hàng', description: 'Sửa tên, số điện thoại và loại khách.' },
      { key: 'customers.delete', label: 'Xoá khách hàng', description: 'Xoá khách hàng khỏi danh sách; lịch sử tài chính vẫn được giữ.' },
    ],
  },
  {
    key: 'memberships',
    label: 'Hội viên',
    // Cùng trang với khách hàng — nhóm không có trang riêng
    permissions: [
      { key: 'memberships.view', label: 'Xem hội viên', description: 'Xem danh sách hội viên, trạng thái và ngày hết hạn.' },
      { key: 'memberships.register', label: 'Đăng ký hội viên', description: 'Đăng ký gói hội viên mới và thu phí.' },
      { key: 'memberships.renew', label: 'Gia hạn hội viên', description: 'Gia hạn gói hội viên đang dùng hoặc đã hết hạn.' },
      { key: 'memberships.backdate', label: 'Ghi nhận thanh toán hội viên lùi ngày', description: 'Ghi nhận thanh toán hội viên với ngày thu trong quá khứ.' },
      { key: 'memberships.plans.manage', label: 'Quản lý gói hội viên', description: 'Tạo, sửa và ngừng dùng các gói hội viên.' },
    ],
  },
  {
    key: 'products',
    label: 'Sản phẩm / Dịch vụ',
    module: { route: '/inventory', label: 'Kho' },
    permissions: [
      { key: 'products.view', label: 'Xem sản phẩm / dịch vụ', description: 'Xem danh sách sản phẩm và dịch vụ trong kho.' },
      { key: 'products.create', label: 'Thêm sản phẩm / dịch vụ', description: 'Thêm sản phẩm hoặc dịch vụ mới.' },
      { key: 'products.edit', label: 'Sửa sản phẩm / dịch vụ', description: 'Sửa tên, giá và thông tin sản phẩm hoặc dịch vụ.' },
      { key: 'products.delete', label: 'Xoá sản phẩm / dịch vụ', description: 'Xoá sản phẩm hoặc dịch vụ khỏi danh sách.' },
    ],
  },
  {
    key: 'stock',
    label: 'Kho — Tồn kho',
    module: { route: '/inventory', label: 'Kho' },
    permissions: [
      { key: 'stock.view', label: 'Xem tồn kho & lịch sử kho', description: 'Xem tồn kho hiện tại và lịch sử nhập xuất kho.' },
      { key: 'stock.post', label: 'Nhập / điều chỉnh kho', description: 'Nhập hàng hoặc điều chỉnh số lượng tồn kho.' },
    ],
  },
  {
    key: 'invoices',
    label: 'Hoá đơn',
    // Xem qua chi tiết khách hàng / giao dịch — nhóm không có trang riêng
    permissions: [
      { key: 'invoices.view', label: 'Xem hoá đơn', description: 'Xem chi tiết hoá đơn và các khoản đã thu.' },
      { key: 'invoices.edit', label: 'Sửa hoá đơn đã thanh toán', description: 'Sửa hoá đơn đã thanh toán, có ghi nhật ký điều chỉnh.' },
      { key: 'invoices.void', label: 'Huỷ hoá đơn', description: 'Huỷ hoá đơn, hoàn tồn kho và loại khỏi báo cáo doanh thu.' },
    ],
  },
  {
    key: 'pricing',
    label: 'Bảng giá',
    module: { route: '/pricing', label: 'Bảng giá' },
    permissions: [
      { key: 'pricing.view', label: 'Xem bảng giá', description: 'Xem các luật giá giờ chơi.' },
      { key: 'pricing.create', label: 'Thêm luật giá', description: 'Thêm luật giá giờ chơi mới.' },
      { key: 'pricing.edit', label: 'Sửa luật giá', description: 'Sửa khung giờ, mức giá và bậc giá.' },
      { key: 'pricing.delete', label: 'Xoá luật giá', description: 'Xoá luật giá giờ chơi.' },
    ],
  },
  {
    key: 'promotions',
    label: 'Khuyến mại',
    module: { route: '/promotions', label: 'Khuyến mại' },
    permissions: [
      { key: 'promotions.view', label: 'Xem khuyến mại', description: 'Xem các chương trình khuyến mại.' },
      { key: 'promotions.create', label: 'Thêm khuyến mại', description: 'Thêm khuyến mại mới cho giờ chơi hoặc hoá đơn.' },
      { key: 'promotions.edit', label: 'Sửa khuyến mại', description: 'Sửa điều kiện và mức giảm của khuyến mại.' },
      { key: 'promotions.delete', label: 'Xoá khuyến mại', description: 'Xoá hoặc ngừng áp dụng khuyến mại.' },
    ],
  },
  {
    key: 'tools',
    label: 'Dụng cụ',
    module: { route: '/tools', label: 'Dụng cụ' },
    permissions: [
      { key: 'tools.view', label: 'Xem dụng cụ', description: 'Xem danh sách dụng cụ và số lượng.' },
      { key: 'tools.create', label: 'Thêm dụng cụ', description: 'Thêm dụng cụ mới.' },
      { key: 'tools.edit', label: 'Sửa dụng cụ', description: 'Sửa tên, số lượng và yêu cầu đếm của dụng cụ.' },
      { key: 'tools.delete', label: 'Xoá dụng cụ', description: 'Xoá dụng cụ khỏi danh sách.' },
    ],
  },
  {
    key: 'shifts',
    label: 'Ca làm',
    module: { route: '/shifts', label: 'Ca làm' },
    permissions: [
      { key: 'shifts.view', label: 'Xem ca làm', description: 'Xem danh sách ca, tiền đầu ca và đối soát cuối ca.' },
      { key: 'shifts.open', label: 'Mở ca', description: 'Mở ca làm mới hoặc tham gia ca đang mở.' },
      { key: 'shifts.close', label: 'Đóng ca', description: 'Đóng ca, nhập tiền cuối ca và chốt chênh lệch.' },
    ],
  },
  {
    key: 'reports',
    label: 'Báo cáo',
    module: { route: '/reports', label: 'Báo cáo' },
    permissions: [
      { key: 'reports.view', label: 'Xem báo cáo (phạm vi của mình)', description: 'Xem báo cáo doanh thu trong phạm vi của chính mình.' },
      { key: 'reports.viewAll', label: 'Xem báo cáo toàn hệ thống', description: 'Xem báo cáo doanh thu toàn hệ thống.' },
      { key: 'reports.export', label: 'Xuất CSV báo cáo', description: 'Xuất dữ liệu báo cáo ra file CSV.' },
    ],
  },
  {
    key: 'cashflows',
    label: 'Thu chi',
    module: { route: '/cashflow', label: 'Thu chi' },
    permissions: [
      { key: 'cashflows.view', label: 'Xem thu chi', description: 'Xem các khoản thu chi ngoài bán hàng.' },
      { key: 'cashflows.create', label: 'Thêm khoản thu / chi', description: 'Thêm khoản thu hoặc chi mới.' },
      { key: 'cashflows.edit', label: 'Sửa khoản thu / chi', description: 'Sửa khoản thu chi đã ghi.' },
      { key: 'cashflows.delete', label: 'Xoá khoản thu / chi', description: 'Xoá khoản thu chi.' },
    ],
  },
  {
    key: 'users',
    label: 'Nhân sự',
    module: { route: '/staff', label: 'Nhân viên' },
    permissions: [
      { key: 'users.view', label: 'Xem nhân viên', description: 'Xem danh sách nhân viên và tài khoản.' },
      { key: 'users.create', label: 'Thêm nhân viên', description: 'Thêm tài khoản nhân viên mới.' },
      { key: 'users.edit', label: 'Sửa nhân viên', description: 'Sửa thông tin, vai trò và mật khẩu nhân viên.' },
      { key: 'users.delete', label: 'Xoá / vô hiệu hoá nhân viên', description: 'Xoá hoặc vô hiệu hoá tài khoản nhân viên.' },
    ],
  },
  {
    key: 'roles',
    label: 'Vai trò & Quyền',
    module: { route: '/roles', label: 'Vai trò' },
    permissions: [
      { key: 'roles.view', label: 'Xem vai trò & quyền', description: 'Xem danh sách vai trò và quyền của từng vai trò.' },
      { key: 'roles.manage', label: 'Tạo / sửa / xoá vai trò, gán quyền', description: 'Tạo, sửa, xoá vai trò và gán quyền.' },
    ],
  },
  {
    key: 'settings',
    label: 'Cài đặt hệ thống',
    permissions: [{ key: 'settings.edit', label: 'Sửa cài đặt hệ thống', description: 'Sửa các cấu hình chung của hệ thống, ví dụ phí giữ xe.' }],
  },
  {
    key: 'students',
    label: 'Học viên',
    module: { route: '/students', label: 'Học viên' },
    permissions: [
      { key: 'students.view', label: 'Xem học viên', description: 'Xem danh sách học viên.' },
      { key: 'students.create', label: 'Thêm học viên', description: 'Thêm học viên mới.' },
      { key: 'students.edit', label: 'Sửa học viên', description: 'Sửa thông tin học viên.' },
      { key: 'students.delete', label: 'Xoá học viên', description: 'Xoá học viên khỏi danh sách.' },
    ],
  },
  {
    key: 'classes',
    label: 'Lớp học',
    module: { route: '/classes', label: 'Lớp học' },
    permissions: [
      { key: 'classes.view', label: 'Xem lớp học', description: 'Xem danh sách lớp học và lịch của lớp.' },
      { key: 'classes.create', label: 'Thêm lớp học', description: 'Tạo lớp học mới.' },
      { key: 'classes.edit', label: 'Sửa lớp học', description: 'Sửa thông tin lớp, lịch học và học viên.' },
      { key: 'classes.delete', label: 'Xoá lớp học', description: 'Xoá lớp học.' },
    ],
  },
  {
    key: 'lessons',
    label: 'Lịch học',
    module: { route: '/lessons', label: 'Lịch học' },
    permissions: [
      { key: 'lessons.view', label: 'Xem lịch học', description: 'Xem lịch học theo ngày hoặc tuần.' },
      { key: 'lessons.create', label: 'Tạo buổi học', description: 'Tạo buổi học mới.' },
      { key: 'lessons.edit', label: 'Sửa buổi học (đổi giờ, điểm danh...)', description: 'Sửa giờ, nội dung và điểm danh buổi học.' },
      { key: 'lessons.delete', label: 'Xoá / huỷ buổi học', description: 'Xoá hoặc huỷ buổi học.' },
    ],
  },
  {
    key: 'series',
    label: 'Khung giờ lịch (chuỗi buổi)',
    permissions: [{ key: 'series.manage', label: 'Quản lý khung giờ lặp lại', description: 'Quản lý khung giờ lặp lại dùng để tạo lịch học.' }],
  },
  {
    key: 'audit',
    label: 'Nhật ký hệ thống',
    permissions: [{ key: 'audit.view', label: 'Xem nhật ký hoạt động', description: 'Xem nhật ký hoạt động của hệ thống.' }],
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
