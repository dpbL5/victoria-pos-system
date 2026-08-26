import { describe, it, expect } from 'vitest'
import { remaining, pickChargeablePackage } from '@/lib/students'
import type { LessonPackageRecord } from '@/lib/students'

function pkg(overrides: Partial<LessonPackageRecord> = {}): LessonPackageRecord {
  return {
    id: 'p1',
    studentId: 's1',
    name: 'Gói 12 buổi',
    total: 12,
    used: 2,
    isActive: true,
    createdAt: new Date('2026-08-01T00:00:00Z'),
    updatedAt: new Date('2026-08-01T00:00:00Z'),
    ...overrides,
  } as LessonPackageRecord
}

describe('package math', () => {
  it('computes remaining lessons', () => {
    expect(remaining({ total: 12, used: 2 })).toBe(10)
    expect(remaining({ total: 12, used: 12 })).toBe(0)
    // Không âm
    expect(remaining({ total: 5, used: 8 })).toBe(0)
  })

  it('picks the chargeable active package', () => {
    const active = pkg({ id: 'a', used: 11, createdAt: new Date('2026-08-01T00:00:00Z') })
    const exhausted = pkg({ id: 'b', used: 12, createdAt: new Date('2026-08-02T00:00:00Z') })
    const inactive = pkg({ id: 'c', isActive: false, used: 0 })
    expect(pickChargeablePackage([exhausted, active, inactive])).toEqual(active)
  })

  it('returns null when no package has remaining lessons', () => {
    const exhausted = pkg({ used: 12 })
    const inactive = pkg({ isActive: false })
    expect(pickChargeablePackage([exhausted, inactive])).toBeNull()
    expect(pickChargeablePackage([])).toBeNull()
  })
})
