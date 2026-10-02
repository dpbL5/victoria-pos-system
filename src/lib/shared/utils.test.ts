import { describe, expect, it } from 'vitest'
import { normalizeSearchText } from './utils'

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
