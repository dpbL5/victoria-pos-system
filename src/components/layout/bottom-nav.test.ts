import { describe, it, expect } from 'vitest'
import { getVisibleNavItems } from '@/components/layout/bottom-nav'

// ── getVisibleNavItems (permission-driven) ────────────────
// Một danh sách item duy nhất khai báo nhóm quyền; bộ tab tự sinh theo quyền.
// Nhóm không có quyền nào → ẩn hoàn toàn khỏi bottom bar.

// Bộ quyền kiểu "quản lý quầy": POS + đặt lịch + báo cáo + kho
const COUNTER_MANAGER = [
  'sessions.view',
  'sessions.checkin',
  'sessions.checkout',
  'bookings.view',
  'reports.view',
  'stock.view',
]
// Bộ quyền kiểu "thu ngân": chỉ làm POS
const CASHIER = ['sessions.view', 'sessions.checkin', 'sessions.checkout']
// Bộ quyền kiểu "giáo viên": chỉ đào tạo
const TEACHER = ['students.view', 'classes.view', 'lessons.view']

describe('getVisibleNavItems', () => {
  it('quyền quản lý quầy: 5 tab, đúng thứ tự trái → phải', () => {
    expect(getVisibleNavItems(COUNTER_MANAGER).map((item) => item.href)).toEqual([
      '/sessions',
      '/bookings',
      '/reports',
      '/inventory',
      '/settings',
    ])
  })

  it('quyền quản lý quầy: đúng nhãn của 5 tab', () => {
    expect(getVisibleNavItems(COUNTER_MANAGER).map((item) => item.label)).toEqual([
      'Ca hôm nay',
      'Lịch đặt',
      'Báo cáo',
      'Kho',
      'Thêm',
    ])
  })

  it('quyền thu ngân chỉ còn Ca hôm nay và Thêm', () => {
    expect(getVisibleNavItems(CASHIER).map((item) => item.href)).toEqual([
      '/sessions',
      '/settings',
    ])
  })

  it('quyền đào tạo: nav riêng Lịch học · Lớp học · Học viên · Thêm', () => {
    expect(getVisibleNavItems(TEACHER).map((item) => item.href)).toEqual([
      '/lessons',
      '/classes',
      '/students',
      '/settings',
    ])
  })

  it('role không có quyền nào: chỉ còn tab Thêm', () => {
    expect(getVisibleNavItems([]).map((item) => item.href)).toEqual(['/settings'])
  })

  it('mọi bộ quyền đều có tab Thêm (/settings)', () => {
    for (const perms of [COUNTER_MANAGER, CASHIER, TEACHER, [], null, undefined]) {
      expect(getVisibleNavItems(perms).map((item) => item.href), String(perms)).toContain('/settings')
    }
  })

  it('không bộ quyền nào thấy href trùng', () => {
    for (const perms of [COUNTER_MANAGER, CASHIER, TEACHER, []]) {
      const hrefs = getVisibleNavItems(perms).map((item) => item.href)
      expect(new Set(hrefs).size, String(perms)).toBe(hrefs.length)
    }
  })
})
