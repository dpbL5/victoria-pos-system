import { describe, it, expect } from 'vitest'
import {
  openShiftSchema,
  closeShiftSchema,
  adjustCashDifferenceSchema,
  manageShiftParticipantSchema,
  removeShiftParticipantSchema,
} from '@/lib/validations/shift'

const STAFF_A = '123e4567-e89b-42d3-a456-426614174000'
const STAFF_B = '223e4567-e89b-42d3-a456-426614174001'

// ── openShiftSchema ─────────────────────────────────────

describe('openShiftSchema', () => {
  it('hợp lệ với openingCash = 500000', () => {
    const result = openShiftSchema.safeParse({ openingCash: 500_000, notes: 'Ca sáng' })
    expect(result.success).toBe(true)
  })

  it('hợp lệ với openingCash = 0 (mặc định)', () => {
    const result = openShiftSchema.safeParse({})
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.openingCash).toBe(0)
  })

  it('mặc định openingCash = 0', () => {
    const result = openShiftSchema.safeParse({ notes: 'Test' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.openingCash).toBe(0)
  })

  it('từ chối openingCash âm', () => {
    const result = openShiftSchema.safeParse({ openingCash: -1000 })
    expect(result.success).toBe(false)
  })

  it('hợp lệ không có notes', () => {
    const result = openShiftSchema.safeParse({ openingCash: 0 })
    expect(result.success).toBe(true)
  })

  it('từ chối notes > 500 ký tự', () => {
    const result = openShiftSchema.safeParse({ openingCash: 0, notes: 'A'.repeat(501) })
    expect(result.success).toBe(false)
  })
})

// ── closeShiftSchema ────────────────────────────────────

describe('closeShiftSchema', () => {
  it('hợp lệ với closingCash và notes', () => {
    const result = closeShiftSchema.safeParse({
      closingCash: 2_000_000,
      notes: 'Ca chiều',
    })
    expect(result.success).toBe(true)
  })

  it('hợp lệ không có notes', () => {
    const result = closeShiftSchema.safeParse({ closingCash: 0 })
    expect(result.success).toBe(true)
  })

  it('từ chối khi thiếu closingCash', () => {
    const result = closeShiftSchema.safeParse({ notes: 'Không có closing' })
    expect(result.success).toBe(false)
  })

  it('từ chối closingCash âm', () => {
    const result = closeShiftSchema.safeParse({ closingCash: -1 })
    expect(result.success).toBe(false)
  })

  it('từ chối notes > 500 ký tự', () => {
    const result = closeShiftSchema.safeParse({
      closingCash: 0,
      notes: 'A'.repeat(501),
    })
    expect(result.success).toBe(false)
  })
})

// ── adjustCashDifferenceSchema ──────────────────────────

describe('adjustCashDifferenceSchema', () => {
  it('hợp lệ với chênh lệch dương', () => {
    const result = adjustCashDifferenceSchema.safeParse({
      cashDifference: 50_000,
    })
    expect(result.success).toBe(true)
  })

  it('hợp lệ với chênh lệch âm', () => {
    const result = adjustCashDifferenceSchema.safeParse({
      cashDifference: -30_000,
      notes: 'Thiếu do đổi tiền lẻ',
    })
    expect(result.success).toBe(true)
  })

  it('hợp lệ với chênh lệch = 0', () => {
    const result = adjustCashDifferenceSchema.safeParse({ cashDifference: 0 })
    expect(result.success).toBe(true)
  })

  it('hợp lệ với chênh lệch lẻ', () => {
    const result = adjustCashDifferenceSchema.safeParse({ cashDifference: 12500.5 })
    expect(result.success).toBe(true)
  })

  it('từ chối khi thiếu cashDifference', () => {
    const result = adjustCashDifferenceSchema.safeParse({ notes: 'Chỉnh sửa' })
    expect(result.success).toBe(false)
  })

  it('từ chối notes > 500 ký tự', () => {
    const result = adjustCashDifferenceSchema.safeParse({
      cashDifference: 0,
      notes: 'A'.repeat(501),
    })
    expect(result.success).toBe(false)
  })
})

// ── manageShiftParticipantSchema ────────────────────────

describe('manageShiftParticipantSchema', () => {
  it('hợp lệ với staffId UUID và role LEAD', () => {
    const result = manageShiftParticipantSchema.safeParse({
      staffId: STAFF_A,
      role: 'LEAD',
    })
    expect(result.success).toBe(true)
  })

  it('mặc định role = STAFF', () => {
    const result = manageShiftParticipantSchema.safeParse({ staffId: STAFF_A })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.role).toBe('STAFF')
  })

  it('từ chối khi thiếu staffId', () => {
    const result = manageShiftParticipantSchema.safeParse({ role: 'STAFF' })
    expect(result.success).toBe(false)
  })

  it('từ chối staffId không phải UUID', () => {
    const result = manageShiftParticipantSchema.safeParse({
      staffId: 'not-a-uuid',
      role: 'STAFF',
    })
    expect(result.success).toBe(false)
  })

  it('từ chối role không hợp lệ', () => {
    const result = manageShiftParticipantSchema.safeParse({
      staffId: STAFF_A,
      role: 'MANAGER',
    })
    expect(result.success).toBe(false)
  })
})

// ── removeShiftParticipantSchema ────────────────────────

describe('removeShiftParticipantSchema', () => {
  it('hợp lệ với staffId UUID', () => {
    const result = removeShiftParticipantSchema.safeParse({ staffId: STAFF_A })
    expect(result.success).toBe(true)
  })

  it('từ chối khi thiếu staffId', () => {
    const result = removeShiftParticipantSchema.safeParse({})
    expect(result.success).toBe(false)
  })

  it('từ chối staffId không phải UUID', () => {
    const result = removeShiftParticipantSchema.safeParse({ staffId: 'abc123' })
    expect(result.success).toBe(false)
  })
})
