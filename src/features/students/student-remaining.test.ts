import { describe, expect, it } from 'vitest'
import { remainingLabel, studentRemaining, studentRowOf, type LessonPackage, type Student } from './types'

const pkg = (overrides: Partial<LessonPackage> = {}): LessonPackage => ({
  id: 'p1',
  studentId: 's1',
  name: 'Gói 12 buổi',
  total: 12,
  used: 3,
  isActive: true,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  ...overrides,
})

const student = (packages: LessonPackage[]): Student => ({
  id: 's1',
  fullName: 'Nguyễn Văn A',
  phone: null,
  birthYear: null,
  notes: null,
  status: 'ACTIVE',
  deletedAt: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  packages,
})

describe('studentRemaining', () => {
  it('cộng dồn các gói đang hoạt động và bỏ qua gói ngừng', () => {
    expect(studentRemaining(student([
      pkg({ total: 12, used: 3 }),
      pkg({ id: 'p2', total: 8, used: 8, isActive: false }),
      pkg({ id: 'p3', total: 4, used: 1 }),
    ]))).toBe(12)
  })

  it('kẹp ở 0 khi gói bị hạ total xuống dưới used', () => {
    expect(studentRemaining(student([pkg({ total: 2, used: 5 })]))).toBe(0)
  })
})

describe('remainingLabel', () => {
  it('hiện số buổi khi còn buổi', () => {
    expect(remainingLabel(studentRowOf(student([pkg({ total: 12, used: 3 })])))).toBe('9 buổi')
  })

  it('phân biệt gói đã hết buổi với học viên chưa mua gói', () => {
    expect(remainingLabel(studentRowOf(student([pkg({ total: 3, used: 3 })])))).toBe('Hết buổi')
    expect(remainingLabel(studentRowOf(student([pkg({ total: 2, used: 5 })])))).toBe('Hết buổi')
    expect(remainingLabel(studentRowOf(student([pkg({ isActive: false })])))).toBe('Hết buổi')
    expect(remainingLabel(studentRowOf(student([])))).toBe('Chưa có gói')
  })

  it('sort được theo số buổi còn lại (giá trị số, không phải chuỗi)', () => {
    const rows = [
      studentRowOf(student([pkg({ total: 12, used: 3 })])),
      studentRowOf(student([pkg({ total: 3, used: 3 })])),
      studentRowOf(student([pkg({ total: 20, used: 1 })])),
    ]

    expect(rows.map((row) => row.remainingSessions)).toEqual([9, 0, 19])
    expect([...rows].sort((a, b) => a.remainingSessions - b.remainingSessions).map(remainingLabel))
      .toEqual(['Hết buổi', '9 buổi', '19 buổi'])
  })
})
