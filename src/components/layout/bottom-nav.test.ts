import { describe, it, expect } from 'vitest'
import { getVisibleNavItems } from '@/components/layout/bottom-nav'

// ── getVisibleNavItems ────────────────────────────────────
// MANAGER/ADMIN: Ca hôm nay · Lịch đặt · Báo cáo · Kho · Thêm.
// STAFF: Ca hôm nay · Thêm. TEACHER: nav đào tạo riêng.

describe('getVisibleNavItems', () => {
  it('ADMIN thấy 5 tab, đúng thứ tự trái → phải', () => {
    expect(getVisibleNavItems('ADMIN').map((item) => item.href)).toEqual([
      '/sessions',
      '/bookings',
      '/reports',
      '/inventory',
      '/settings',
    ])
  })

  it('ADMIN thấy đúng nhãn của 5 tab', () => {
    expect(getVisibleNavItems('ADMIN').map((item) => item.label)).toEqual([
      'Ca hôm nay',
      'Lịch đặt',
      'Báo cáo',
      'Kho',
      'Thêm',
    ])
  })

  it('MANAGER dùng chung bộ tab với ADMIN', () => {
    expect(getVisibleNavItems('MANAGER').map((item) => item.href)).toEqual([
      '/sessions',
      '/bookings',
      '/reports',
      '/inventory',
      '/settings',
    ])
  })

  it('STAFF chỉ còn Ca hôm nay và Thêm', () => {
    expect(getVisibleNavItems('STAFF').map((item) => item.href)).toEqual([
      '/sessions',
      '/settings',
    ])
  })

  it('TEACHER dùng nav đào tạo riêng', () => {
    expect(getVisibleNavItems('TEACHER').map((item) => item.href)).toEqual([
      '/lessons',
      '/classes',
      '/students',
      '/settings',
    ])
  })

  it('mọi role đều có tab Thêm (/settings)', () => {
    for (const role of ['ADMIN', 'MANAGER', 'STAFF', 'TEACHER']) {
      expect(getVisibleNavItems(role).map((item) => item.href), role).toContain('/settings')
    }
  })

  it('không role nào thấy href trùng', () => {
    for (const role of ['ADMIN', 'MANAGER', 'STAFF', 'TEACHER']) {
      const hrefs = getVisibleNavItems(role).map((item) => item.href)
      expect(new Set(hrefs).size, role).toBe(hrefs.length)
    }
  })
})
