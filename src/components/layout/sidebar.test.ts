import { describe, it, expect } from 'vitest'
import { getVisibleMenuGroups } from '@/components/layout/sidebar'

// ── getVisibleMenuGroups ──────────────────────────────────

describe('getVisibleMenuGroups', () => {
  it('ADMIN thấy đủ 6 nhóm', () => {
    const groups = getVisibleMenuGroups('ADMIN')
    expect(groups.map((group) => group.label)).toEqual([
      'Vận hành',
      'Khách hàng',
      'Kho',
      'Đào tạo',
      'Quản trị',
      'Hệ thống',
    ])
  })

  it('ADMIN thấy nhóm Đào tạo gồm Lịch học, Lớp học và Học viên', () => {
    const groups = getVisibleMenuGroups('ADMIN')
    const training = groups.find((group) => group.label === 'Đào tạo')
    expect(training?.items.map((item) => item.href)).toEqual(['/lessons', '/classes', '/students'])
  })

  it('MANAGER không thấy mục adminOnly, nhóm rỗng bị bỏ', () => {
    const groups = getVisibleMenuGroups('MANAGER')
    const hrefs = groups.flatMap((group) => group.items.map((item) => item.href))
    expect(hrefs).not.toContain('/pricing')
    expect(hrefs).not.toContain('/cashflow')
    expect(hrefs).toEqual(['/sessions', '/bookings', '/shifts', '/customers', '/inventory', '/settings'])
    expect(groups.map((group) => group.label)).toEqual(['Vận hành', 'Khách hàng', 'Kho', 'Hệ thống'])
  })

  it('STAFF không thấy mục staffHidden, chỉ còn 3 nhóm', () => {
    const groups = getVisibleMenuGroups('STAFF')
    const hrefs = groups.flatMap((group) => group.items.map((item) => item.href))
    expect(hrefs).toEqual(['/sessions', '/bookings', '/customers', '/settings'])
    expect(groups.every((group) => group.items.length > 0)).toBe(true)
  })

  it('TEACHER chỉ thấy các mục thuộc Đào tạo', () => {
    const groups = getVisibleMenuGroups('TEACHER')
    expect(groups.map((group) => group.label)).toEqual(['Đào tạo'])
    expect(groups[0]?.items.map((item) => item.href)).toEqual(['/lessons', '/classes', '/students'])
  })

  it('mọi href trong menu đều duy nhất', () => {
    const hrefs = getVisibleMenuGroups('ADMIN').flatMap((group) =>
      group.items.map((item) => item.href)
    )
    expect(new Set(hrefs).size).toBe(hrefs.length)
})
})
