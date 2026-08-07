import { describe, it, expect } from 'vitest'
import { addMonthsKeepingDay, calculateRenewalPeriod } from '@/lib/memberships'

describe('addMonthsKeepingDay', () => {
  it('cộng 1 tháng giữ ngày tương ứng', () => {
    const result = addMonthsKeepingDay(new Date('2026-01-15'), 1)
    expect(result.toISOString().split('T')[0]).toBe('2026-02-15')
  })

  it('cộng 1 tháng từ ngày 31/1 xuống 28/2 (năm không nhuận)', () => {
    const result = addMonthsKeepingDay(new Date('2026-01-31'), 1)
    expect(result.toISOString().split('T')[0]).toBe('2026-02-28')
  })

  it('cộng 1 tháng từ ngày 31/1 xuống 29/2 (năm nhuận)', () => {
    const result = addMonthsKeepingDay(new Date('2028-01-31'), 1)
    expect(result.toISOString().split('T')[0]).toBe('2028-02-29')
  })

  it('cộng 1 tháng từ ngày 31/3 ra 30/4', () => {
    const result = addMonthsKeepingDay(new Date('2026-03-31'), 1)
    expect(result.toISOString().split('T')[0]).toBe('2026-04-30')
  })

  it('cộng 12 tháng giữ đúng ngày và tăng năm', () => {
    const result = addMonthsKeepingDay(new Date('2026-07-08'), 12)
    expect(result.toISOString().split('T')[0]).toBe('2027-07-08')
  })

  it('cộng 3 tháng từ ngày 31/1', () => {
    const result = addMonthsKeepingDay(new Date('2026-01-31'), 3)
    expect(result.toISOString().split('T')[0]).toBe('2026-04-30')
  })

  it('cộng 1 tháng từ ngày 15/12', () => {
    const result = addMonthsKeepingDay(new Date('2026-12-15'), 1)
    expect(result.toISOString().split('T')[0]).toBe('2027-01-15')
  })

  it('cộng 1 tháng từ ngày 28/1 (không nhuận)', () => {
    const result = addMonthsKeepingDay(new Date('2026-01-28'), 1)
    expect(result.toISOString().split('T')[0]).toBe('2026-02-28')
  })
})

describe('calculateRenewalPeriod', () => {
  const paidAt = new Date('2026-07-08T10:00:00Z')
  const durationMonths = 1

  it('không có membership cũ → startsAt = paidAt', () => {
    const { startsAt, expiresAt } = calculateRenewalPeriod(null, durationMonths, paidAt)

    expect(startsAt.toISOString().split('T')[0]).toBe('2026-07-08')
    expect(expiresAt.toISOString().split('T')[0]).toBe('2026-08-08')
  })

  it('hội viên còn hạn (expiresAt > paidAt) → kỳ mới bắt đầu sau expiresAt', () => {
    const latest = { expiresAt: new Date('2026-07-20T00:00:00Z') }
    const { startsAt, expiresAt } = calculateRenewalPeriod(latest, durationMonths, paidAt)

    // Kỳ mới bắt đầu từ 2026-07-20 (ngày hết hạn cũ)
    expect(startsAt.toISOString().split('T')[0]).toBe('2026-07-20')
    expect(expiresAt.toISOString().split('T')[0]).toBe('2026-08-20')
  })

  it('hội viên hết hạn (expiresAt < paidAt) → kỳ mới bắt đầu từ paidAt', () => {
    const latest = { expiresAt: new Date('2026-06-01T00:00:00Z') }
    const { startsAt, expiresAt } = calculateRenewalPeriod(latest, durationMonths, paidAt)

    expect(startsAt.toISOString().split('T')[0]).toBe('2026-07-08')
    expect(expiresAt.toISOString().split('T')[0]).toBe('2026-08-08')
  })

  it('hội viên hết hạn đúng ngày paidAt (expiresAt = paidAt) → kỳ mới từ paidAt', () => {
    const latest = { expiresAt: new Date('2026-07-08T00:00:00Z') }
    const { startsAt, expiresAt } = calculateRenewalPeriod(latest, durationMonths, paidAt)

    // expiresAt (2026-07-08T00:00:00) <= paidAt (2026-07-08T10:00:00) → startsAt = paidAt
    expect(startsAt.toISOString().split('T')[0]).toBe('2026-07-08')
    expect(expiresAt.toISOString().split('T')[0]).toBe('2026-08-08')
  })

  it('gia hạn 3 tháng cho hội viên mới', () => {
    const { startsAt, expiresAt } = calculateRenewalPeriod(null, 3, paidAt)

    expect(startsAt.toISOString().split('T')[0]).toBe('2026-07-08')
    expect(expiresAt.toISOString().split('T')[0]).toBe('2026-10-08')
  })

  it('gia hạn 12 tháng từ cuối tháng 1 (năm không nhuận)', () => {
    const janPaidAt = new Date('2026-01-31T10:00:00Z')
    const latest = { expiresAt: new Date('2026-01-31T00:00:00Z') }

    // expiresAt <= paidAt → startsAt = paidAt
    const { startsAt, expiresAt } = calculateRenewalPeriod(latest, 12, janPaidAt)

    expect(startsAt.toISOString().split('T')[0]).toBe('2026-01-31')
    expect(expiresAt.toISOString().split('T')[0]).toBe('2027-01-31')
  })

  it('hội viên đóng tiếp sớm khi còn 5 ngày hạn', () => {
    const paidAtEarly = new Date('2026-07-15T10:00:00Z')
    const latest = { expiresAt: new Date('2026-07-20T00:00:00Z') }

    const { startsAt, expiresAt } = calculateRenewalPeriod(latest, 1, paidAtEarly)

    // Còn hạn → kỳ mới nối tiếp
    expect(startsAt.toISOString().split('T')[0]).toBe('2026-07-20')
    expect(expiresAt.toISOString().split('T')[0]).toBe('2026-08-20')
  })
})
