// ── Role helpers — chia sẻ giữa backend (API routes) và frontend (components) ─────
export function isManagerOrAdmin(role: string | undefined): boolean {
  return role === 'ADMIN' || role === 'MANAGER'
}

/** Chỉ ADMIN — MANAGER không có quyền quản trị hệ thống (bảng giá, khuyến mại, dụng cụ, nhân viên, thu chi, học viên...) */
export function isAdminOnly(role: string | undefined): boolean {
  return role === 'ADMIN'
}

/** Nhãn hiển thị cho vai trò */
export function getRoleLabel(role: string): string {
  switch (role) {
    case 'ADMIN':
      return 'Quản trị viên'
    case 'MANAGER':
      return 'Quản lý'
    case 'STAFF':
      return 'Nhân viên'
    default:
      return role
  }
}
