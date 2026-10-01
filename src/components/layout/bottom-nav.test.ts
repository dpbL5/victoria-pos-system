import { describe, it, expect } from 'vitest'
import { getVisibleNavItems } from '@/components/layout/bottom-nav'

// ── getVisibleNavItems ────────────────────────────────────
// Thứ tự khoá theo đúng thứ tự trái → phải đang chạy; bộ tab khoá theo guard
// thật của từng route (/shifts, /reports, /lessons có guard ở page.tsx).

describe('getVisibleNavItems', () => {
  it('ADMIN thấy đủ 5 tab, đúng thứ tự trái → phải', () => {
    expect(getVisibleNavItems('ADMIN').map((item) => item.href)).toEqual([
      '/sessions',
      '/shifts',
      '/reports',
      '/lessons',
      '/settings',
    ])
  })

  it('ADMIN thấy đúng nhãn của 5 tab', () => {
    expect(getVisibleNavItems('ADMIN').map((item) => item.label)).toEqual([
      'Ca hôm nay',
      'Ca làm',
      'Báo cáo',
      'Lịch học',
      'Thêm',
    ])
  })

  it('MANAGER không thấy /reports (ADMIN) và /lessons (ADMIN/TEACHER)', () => {
    expect(getVisibleNavItems('MANAGER').map((item) => item.href)).toEqual([
      '/sessions',
      '/shifts',
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

  it('không role nào thấy href trùng', () => {
    for (const role of ['ADMIN', 'MANAGER', 'STAFF', 'TEACHER']) {
      const hrefs = getVisibleNavItems(role).map((item) => item.href)
      expect(new Set(hrefs).size, role).toBe(hrefs.length)
    }
  })
})
