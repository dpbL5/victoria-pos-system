import { describe, expect, it } from 'vitest'
import { normalizeSearchText, vnNameSortKey } from './utils'

describe('normalizeSearchText', () => {
  it('bỏ dấu tiếng Việt và viết thường', () => {
    expect(normalizeSearchText('Nguyễn An')).toBe('nguyen an')
    expect(normalizeSearchText('Đỗ Đức')).toBe('do duc')
    expect(normalizeSearchText('Khách lẻ')).toBe('khach le')
  })

  it('giữ nguyên chuỗi không dấu và số điện thoại', () => {
    expect(normalizeSearchText('0912345678')).toBe('0912345678')
    expect(normalizeSearchText('VIP')).toBe('vip')
  })
})

describe('vnNameSortKey', () => {
  it('sắp xếp theo từ cuối của tên', () => {
    const names = ['Lê Hoàng', 'Đặng Thị Bình', 'Nguyễn Văn An']
    expect(names.map(vnNameSortKey).sort((a, b) => a.localeCompare(b, 'vi')))
      .toEqual([vnNameSortKey('Nguyễn Văn An'), vnNameSortKey('Đặng Thị Bình'), vnNameSortKey('Lê Hoàng')])
  })
})
