import { describe, it, expect } from 'vitest'
import {
  buildWeeklyRrule,
  parseRruleDays,
  generateOccurrences,
  timeToMinutes,
} from '@/lib/students'

describe('rrule helpers', () => {
  it('builds weekly RRULE from daysOfWeek', () => {
    expect(buildWeeklyRrule([1, 4])).toBe('FREQ=WEEKLY;BYDAY=MO,TH')
    expect(buildWeeklyRrule([0, 6])).toBe('FREQ=WEEKLY;BYDAY=SU,SA')
    expect(buildWeeklyRrule([3])).toBe('FREQ=WEEKLY;BYDAY=WE')
  })

  it('parses daysOfWeek back from RRULE', () => {
    expect(parseRruleDays('FREQ=WEEKLY;BYDAY=MO,TH')).toEqual([1, 4])
    expect(parseRruleDays('FREQ=WEEKLY;BYDAY=SU,SA')).toEqual([0, 6])
    expect(parseRruleDays('FREQ=WEEKLY')).toEqual([])
  })

  it('converts time string to minutes', () => {
    expect(timeToMinutes('18:00')).toBe(1080)
    expect(timeToMinutes('00:30')).toBe(30)
  })
})

describe('generateOccurrences', () => {
  it('generates occurrences for matching weekdays only', () => {
    const from = new Date('2026-08-17T00:00:00.000Z') // T2
    const to = new Date('2026-08-23T00:00:00.000Z') // CN
    const result = generateOccurrences([1, 4], '18:00', from, to)

    // T2 18:00 và T5 18:00 giờ VN → UTC 11:00
    expect(result).toHaveLength(2)
    expect(result[0].toISOString()).toBe('2026-08-17T11:00:00.000Z')
    expect(result[1].toISOString()).toBe('2026-08-20T11:00:00.000Z')
  })

  it('respects the from boundary (không sinh buổi trước from)', () => {
    const from = new Date('2026-08-17T12:00:00.000Z') // sau giờ buổi T2
    const to = new Date('2026-08-23T00:00:00.000Z')
    const result = generateOccurrences([1], '18:00', from, to)
    // Buổi T2 11:00 UTC < from 12:00 UTC → bị loại
    expect(result).toHaveLength(0)
  })

  it('includes end date day', () => {
    const from = new Date('2026-08-17T00:00:00.000Z')
    const to = new Date('2026-08-17T00:00:00.000Z') // cùng ngày
    const result = generateOccurrences([1], '18:00', from, to)
    expect(result).toHaveLength(1)
  })
})
