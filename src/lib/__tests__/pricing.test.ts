import { describe, it, expect } from 'vitest'
import { createPricingRuleSchema, updatePricingRuleSchema } from '@/lib/pricing'
import { calcHours, getDayType } from '@/lib/utils'

// ── createPricingRuleSchema ───────────────────────────────

describe('createPricingRuleSchema', () => {
  const validRule = {
    name: 'Giờ thường ngày thường',
    hourFrom: 9,
    hourTo: 17,
    ratePerHour: 150000,
    daysOfWeek: [1, 2, 3, 4, 5],
    dayType: 'WEEKDAY' as const,
    effectiveFrom: '2026-07-01',
  }

  it('hợp lệ với dữ liệu đầy đủ', () => {
    const result = createPricingRuleSchema.safeParse(validRule)
    expect(result.success).toBe(true)
  })

  it('hợp lệ khi hourTo = null (áp dụng đến hết ngày)', () => {
    const result = createPricingRuleSchema.safeParse({ ...validRule, hourTo: null })
    expect(result.success).toBe(true)
  })

  it('hợp lệ khi không có hourTo', () => {
    const { hourTo: _, ...withoutHourTo } = validRule
    const result = createPricingRuleSchema.safeParse(withoutHourTo)
    expect(result.success).toBe(true)
  })

  it('hợp lệ với dayType = WEEKEND', () => {
    const result = createPricingRuleSchema.safeParse({ ...validRule, dayType: 'WEEKEND' })
    expect(result.success).toBe(true)
  })

  it('hợp lệ khi không có effectiveTo (không hết hạn)', () => {
    const result = createPricingRuleSchema.safeParse({ ...validRule, effectiveTo: null })
    expect(result.success).toBe(true)
  })

  // ── Tên quy tắc ──

  it('từ chối khi thiếu tên', () => {
    const { name: _, ...withoutName } = validRule
    const result = createPricingRuleSchema.safeParse(withoutName)
    expect(result.success).toBe(false)
  })

  it('từ chối khi tên rỗng', () => {
    const result = createPricingRuleSchema.safeParse({ ...validRule, name: '' })
    expect(result.success).toBe(false)
  })

  it('từ chối khi tên > 100 ký tự', () => {
    const result = createPricingRuleSchema.safeParse({ ...validRule, name: 'A'.repeat(101) })
    expect(result.success).toBe(false)
  })

  // ── Khung giờ ──

  it('từ chối khi hourFrom < 0', () => {
    const result = createPricingRuleSchema.safeParse({ ...validRule, hourFrom: -1 })
    expect(result.success).toBe(false)
  })

  it('từ chối khi hourFrom > 23', () => {
    const result = createPricingRuleSchema.safeParse({ ...validRule, hourFrom: 24 })
    expect(result.success).toBe(false)
  })

  it('từ chối khi hourTo <= hourFrom', () => {
    const result = createPricingRuleSchema.safeParse({ ...validRule, hourFrom: 17, hourTo: 17 })
    expect(result.success).toBe(false)
  })

  it('từ chối khi hourTo < hourFrom', () => {
    const result = createPricingRuleSchema.safeParse({ ...validRule, hourFrom: 17, hourTo: 10 })
    expect(result.success).toBe(false)
  })

  // ── Giá ──

  it('từ chối khi ratePerHour = 0', () => {
    const result = createPricingRuleSchema.safeParse({ ...validRule, ratePerHour: 0 })
    expect(result.success).toBe(false)
  })

  it('từ chối khi ratePerHour âm', () => {
    const result = createPricingRuleSchema.safeParse({ ...validRule, ratePerHour: -1000 })
    expect(result.success).toBe(false)
  })

  it('chấp nhận ratePerHour có giá trị lẻ (Decimal)', () => {
    const result = createPricingRuleSchema.safeParse({ ...validRule, ratePerHour: 55500.5 })
    expect(result.success).toBe(true)
  })

  // ── DayType ──

  it('từ chối dayType không hợp lệ', () => {
    const result = createPricingRuleSchema.safeParse({ ...validRule, dayType: 'HOLIDAY' })
    expect(result.success).toBe(false)
  })

  it('hợp lệ khi chọn ngày cụ thể lặp hằng tuần', () => {
    const result = createPricingRuleSchema.safeParse({ ...validRule, daysOfWeek: [1, 3, 5] })
    expect(result.success).toBe(true)
  })

  it('từ chối khi chưa chọn ngày lặp', () => {
    const result = createPricingRuleSchema.safeParse({ ...validRule, daysOfWeek: [] })
    expect(result.success).toBe(false)
  })

  it('từ chối khi ngày lặp bị trùng', () => {
    const result = createPricingRuleSchema.safeParse({ ...validRule, daysOfWeek: [1, 1, 2] })
    expect(result.success).toBe(false)
  })

  // ── Ngày hiệu lực ──

  it('từ chối khi thiếu effectiveFrom', () => {
    const { effectiveFrom: _, ...without } = validRule
    const result = createPricingRuleSchema.safeParse({ ...without, effectiveFrom: '' })
    expect(result.success).toBe(false)
  })

  it('từ chối khi effectiveTo < effectiveFrom', () => {
    const result = createPricingRuleSchema.safeParse({
      ...validRule,
      effectiveFrom: '2026-07-15',
      effectiveTo: '2026-07-10',
    })
    expect(result.success).toBe(false)
  })

  it('chấp nhận effectiveTo = effectiveFrom (cùng ngày)', () => {
    const result = createPricingRuleSchema.safeParse({
      ...validRule,
      effectiveFrom: '2026-07-15',
      effectiveTo: '2026-07-15',
    })
    expect(result.success).toBe(true)
  })

  it('chấp nhận effectiveTo > effectiveFrom', () => {
    const result = createPricingRuleSchema.safeParse({
      ...validRule,
      effectiveFrom: '2026-07-15',
      effectiveTo: '2026-08-15',
    })
    expect(result.success).toBe(true)
  })
})

// ── updatePricingRuleSchema ───────────────────────────────

describe('updatePricingRuleSchema', () => {
  it('cho phép cập nhật một phần (chỉ tên)', () => {
    const result = updatePricingRuleSchema.safeParse({ name: 'Giá mới' })
    expect(result.success).toBe(true)
  })

  it('cho phép object rỗng', () => {
    const result = updatePricingRuleSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it('cho phép cập nhật ratePerHour', () => {
    const result = updatePricingRuleSchema.safeParse({ ratePerHour: 200000 })
    expect(result.success).toBe(true)
  })

  it('cho phép đặt hourTo = null (bỏ giới hạn)', () => {
    const result = updatePricingRuleSchema.safeParse({ hourTo: null })
    expect(result.success).toBe(true)
  })

  it('từ chối ratePerHour = 0 khi cập nhật', () => {
    const result = updatePricingRuleSchema.safeParse({ ratePerHour: 0 })
    expect(result.success).toBe(false)
  })

  it('từ chối dayType không hợp lệ', () => {
    const result = updatePricingRuleSchema.safeParse({ dayType: 'HOLIDAY' })
    expect(result.success).toBe(false)
  })

  it('từ chối hourTo <= hourFrom khi cả 2 được cập nhật', () => {
    const result = updatePricingRuleSchema.safeParse({ hourFrom: 17, hourTo: 10 })
    expect(result.success).toBe(false)
  })
})

// ── getDayType ─────────────────────────────────────────────

describe('getDayType', () => {
  it('thứ 2 (Monday) → WEEKDAY', () => {
    const monday = new Date('2026-07-06T10:00:00Z') // Monday
    expect(getDayType(monday)).toBe('WEEKDAY')
  })

  it('thứ 3 (Tuesday) → WEEKDAY', () => {
    const tuesday = new Date('2026-07-07T10:00:00Z') // Tuesday
    expect(getDayType(tuesday)).toBe('WEEKDAY')
  })

  it('thứ 7 (Saturday) → WEEKEND', () => {
    const saturday = new Date('2026-07-11T10:00:00Z') // Saturday
    expect(getDayType(saturday)).toBe('WEEKEND')
  })

  it('chủ nhật (Sunday) → WEEKEND', () => {
    const sunday = new Date('2026-07-12T10:00:00Z') // Sunday
    expect(getDayType(sunday)).toBe('WEEKEND')
  })

  it('không trả về HOLIDAY (đã bị loại bỏ)', () => {
    // Test bất kỳ ngày nào - không bao giờ trả về HOLIDAY
    const days = [
      new Date('2026-01-01'), // Tết Dương lịch (thứ 5)
      new Date('2026-04-30'), // 30/4 (thứ 5)
      new Date('2026-09-02'), // 2/9 (thứ 4)
    ]
    for (const date of days) {
      expect(getDayType(date)).not.toBe('HOLIDAY')
    }
  })
})

// ── calcHours ──────────────────────────────────────────────

describe('calcHours', () => {
  it('1 giờ chính xác', () => {
    const start = new Date('2026-07-09T10:00:00Z')
    const end = new Date('2026-07-09T11:00:00Z')
    expect(calcHours(start, end)).toBe(1)
  })

  it('30 phút = 0.5 giờ', () => {
    const start = new Date('2026-07-09T10:00:00Z')
    const end = new Date('2026-07-09T10:30:00Z')
    expect(calcHours(start, end)).toBe(0.5)
  })

  it('15 phút = 0.25 giờ', () => {
    const start = new Date('2026-07-09T10:00:00Z')
    const end = new Date('2026-07-09T10:15:00Z')
    expect(calcHours(start, end)).toBe(0.25)
  })

  it('2 giờ 30 phút = 2.5 giờ', () => {
    const start = new Date('2026-07-09T10:00:00Z')
    const end = new Date('2026-07-09T12:30:00Z')
    expect(calcHours(start, end)).toBe(2.5)
  })

  it('làm tròn đến 2 chữ số thập phân', () => {
    const start = new Date('2026-07-09T10:00:00Z')
    const end = new Date('2026-07-09T10:20:00Z') // 20 min = 0.333... hours
    const result = calcHours(start, end)
    expect(result).toBe(0.33)
  })

  it('end < start → số âm (để caller xử lý)', () => {
    const start = new Date('2026-07-09T11:00:00Z')
    const end = new Date('2026-07-09T10:00:00Z')
    expect(calcHours(start, end)).toBe(-1)
  })
})
