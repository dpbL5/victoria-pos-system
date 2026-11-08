import { describe, it, expect } from 'vitest'
import { getVisibleMenuGroups } from '@/components/layout/sidebar'

// ── getVisibleMenuGroups (permission-driven) ──────────────
// Item hiện khi user có quyền trong một trong các nhóm khai báo;
// nhóm rỗng (không còn item) bị ẩn luôn tiêu đề.

const ALL_ADMIN = [
  'sessions.view',
  'sessions.checkin',
  'bookings.view',
  'shifts.view',
  'cashflows.view',
  'customers.view',
  'memberships.plans.manage',
  'products.view',
  'stock.view',
  'tools.view',
  'lessons.view',
  'classes.view',
  'students.view',
  'reports.view',
  'pricing.view',
  'promotions.view',
  'users.view',
  'roles.view',
]

describe('getVisibleMenuGroups', () => {
  it('đủ quyền: thấy đủ 6 nhóm', () => {
    const groups = getVisibleMenuGroups(ALL_ADMIN)
    expect(groups.map((group) => group.label)).toEqual([
      'Vận hành',
      'Khách hàng',
      'Kho',
      'Đào tạo',
      'Quản trị',
      'Hệ thống',
    ])
  })

  it('đủ quyền: nhóm Đào tạo gồm Lịch học, Lớp học và Học viên', () => {
    const groups = getVisibleMenuGroups(ALL_ADMIN)
    const training = groups.find((group) => group.label === 'Đào tạo')
    expect(training?.items.map((item) => item.href)).toEqual(['/lessons', '/classes', '/students'])
  })

  it('đủ quyền: nhóm Quản trị gồm Báo cáo, Bảng giá, Khuyến mại, Nhân viên, Vai trò', () => {
    const groups = getVisibleMenuGroups(ALL_ADMIN)
    const admin = groups.find((group) => group.label === 'Quản trị')
    expect(admin?.items.map((item) => item.href)).toEqual([
      '/reports',
      '/pricing',
      '/promotions',
      '/staff',
      '/roles',
    ])
  })

  it('quyền quầy (không đào tạo/quản trị): nhóm rỗng bị ẩn cả tiêu đề', () => {
    const groups = getVisibleMenuGroups([
      'sessions.view',
      'sessions.checkin',
      'bookings.view',
      'shifts.view',
      'customers.view',
      'products.view',
      'stock.view',
    ])
    expect(groups.map((group) => group.label)).toEqual(['Vận hành', 'Khách hàng', 'Kho', 'Hệ thống'])
    const hrefs = groups.flatMap((group) => group.items.map((item) => item.href))
    expect(hrefs).toEqual([
      '/sessions',
      '/bookings',
      '/shifts',
      '/customers',
      '/inventory',
      '/inventory/movements',
      '/settings',
    ])
  })

  it('quyền đào tạo: chỉ thấy Đào tạo + Hệ thống', () => {
    const groups = getVisibleMenuGroups(['lessons.view', 'classes.view', 'students.view'])
    expect(groups.map((group) => group.label)).toEqual(['Đào tạo', 'Hệ thống'])
    expect(groups.flatMap((group) => group.items.map((item) => item.href))).toEqual([
      '/lessons',
      '/classes',
      '/students',
      '/settings',
    ])
  })

  it('mọi bộ quyền đều vào được tab Thêm (/settings) từ sidebar', () => {
    for (const perms of [ALL_ADMIN, [], null, undefined]) {
      const hrefs = getVisibleMenuGroups(perms).flatMap((group) =>
        group.items.map((item) => item.href)
      )
      expect(hrefs, String(perms)).toContain('/settings')
    }
  })

  it('mọi href trong menu đều duy nhất', () => {
    const hrefs = getVisibleMenuGroups(ALL_ADMIN).flatMap((group) =>
      group.items.map((item) => item.href)
    )
    expect(new Set(hrefs).size).toBe(hrefs.length)
  })
})
