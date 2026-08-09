import { describe, it, expect } from 'vitest'
import {
  formatVND,
  formatHours,
  toInputDate,
  parseStartOfDay,
  parseEndOfDay,
} from '@/lib/shared/utils'

// ── formatVND ───────────────────────────────────────────

describe('formatVND', () => {
  it('định dạng 150000 → "150.000đ"', () => {
    expect(formatVND(150000)).toBe('150.000đ')
  })

  it('định dạng 0 → "0đ"', () => {
    expect(formatVND(0)).toBe('0đ')
  })

  it('định dạng chuỗi "500000" → "500.000đ"', () => {
    expect(formatVND('500000')).toBe('500.000đ')
  })

  it('định dạng số triệu', () => {
    expect(formatVND(1_250_000)).toBe('1.250.000đ')
  })

  it('định dạng số âm (nếu có)', () => {
    expect(formatVND(-50000)).toBe('-50.000đ')
  })
})

// ── formatHours ─────────────────────────────────────────

describe('formatHours', () => {
  it('1.5 giờ → "1h30p"', () => {
    expect(formatHours(1.5)).toBe('1h30p')
  })

  it('3 giờ chẵn → "3h"', () => {
    expect(formatHours(3)).toBe('3h')
  })

  it('0.25 giờ → "0h15p"', () => {
    expect(formatHours(0.25)).toBe('0h15p')
  })

  it('2.75 giờ → "2h45p"', () => {
    expect(formatHours(2.75)).toBe('2h45p')
  })

  it('0 giờ → "0h"', () => {
    expect(formatHours(0)).toBe('0h')
  })
})

// ── toInputDate ─────────────────────────────────────────

describe('toInputDate', () => {
  it('trả về "YYYY-MM-DD" theo giờ Việt Nam', () => {
    const date = new Date('2026-07-15T10:00:00+07:00')
    expect(toInputDate(date)).toBe('2026-07-15')
  })

  it('ngày rìa: UTC midnight nhưng VN đã sáng hôm sau', () => {
    // 2026-07-15 17:00 UTC = 2026-07-16 00:00 VN
    const lateUtc = new Date('2026-07-15T17:00:00Z')
    expect(toInputDate(lateUtc)).toBe('2026-07-16')
  })

  it('ngày đầu tháng', () => {
    const date = new Date('2026-01-01T00:00:00+07:00')
    expect(toInputDate(date)).toBe('2026-01-01')
  })

  it('ngày cuối tháng 12', () => {
    const date = new Date('2026-12-31T23:59:59+07:00')
    expect(toInputDate(date)).toBe('2026-12-31')
  })
})

// ── parseStartOfDay ────────────────────────────────────

describe('parseStartOfDay', () => {
  it('chuyển "2026-07-15" thành 00:00:00 giờ VN', () => {
    const result = parseStartOfDay('2026-07-15')
    expect(result.toISOString()).toBe('2026-07-14T17:00:00.000Z')
  })

  it('ngày đầu năm', () => {
    const result = parseStartOfDay('2026-01-01')
    expect(result.toISOString()).toBe('2025-12-31T17:00:00.000Z')
  })
})

// ── parseEndOfDay ──────────────────────────────────────

describe('parseEndOfDay', () => {
  it('chuyển "2026-07-15" thành 23:59:59.999 giờ VN', () => {
    const result = parseEndOfDay('2026-07-15')
    expect(result.toISOString()).toBe('2026-07-15T16:59:59.999Z')
  })

  it('ngày đầu năm', () => {
    const result = parseEndOfDay('2026-01-01')
    expect(result.toISOString()).toBe('2026-01-01T16:59:59.999Z')
  })
})
