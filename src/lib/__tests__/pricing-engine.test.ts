import { describe, it, expect, vi } from 'vitest'
import { calculatePlayerPrice, calculateSessionPriceFromLoaded } from '@/lib/sessions'
import type { SessionWithDetails } from '@/lib/sessions'

// ── calculatePlayerPrice — tiền giờ chơi per-player (played time = elapsed − pause) ──

describe('calculatePlayerPrice', () => {
  const startTime = new Date('2026-08-07T10:00:00Z')

  it('played time trừ pause: chơi 2h, pause 30p → tính 1.5h', () => {
    const result = calculatePlayerPrice({
      startTime,
      endTime: new Date('2026-08-07T12:00:00Z'),
      pausedSeconds: 1800,
      hourlyRate: 100000,
      tiers: [],
      promotion: null,
    })
    expect(result.totalHours).toBe(1.5)
    expect(result.subtotal).toBe(150000)
    expect(result.promotionDiscount).toBe(0)
    expect(result.grandTotal).toBe(150000)
    expect(result.pausedSeconds).toBe(1800)
  })

  it('không pause → played time = elapsed', () => {
    const result = calculatePlayerPrice({
      startTime,
      endTime: new Date('2026-08-07T11:00:00Z'),
      pausedSeconds: 0,
      hourlyRate: 80000,
      tiers: [],
      promotion: null,
    })
    expect(result.totalHours).toBe(1)
    expect(result.grandTotal).toBe(80000)
  })

  it('tiered: bậc luỹ tiến theo từng phân khúc giờ', () => {
    const result = calculatePlayerPrice({
      startTime,
      endTime: new Date('2026-08-07T14:00:00Z'),
      pausedSeconds: 0,
      hourlyRate: 100000,
      tiers: [
        { minHours: 1, ratePerHour: 90000 },
        { minHours: 3, ratePerHour: 70000 },
      ],
      promotion: null,
    })
    // 1h × 100k + 2h × 90k + 1h × 70k = 100 + 180 + 70 = 350k
    expect(result.totalHours).toBe(4)
    expect(result.subtotal).toBe(350000)
    expect(result.grandTotal).toBe(350000)
  })

  it('khuyến mại PERCENT áp dụng trên subtotal của player', () => {
    const result = calculatePlayerPrice({
      startTime,
      endTime: new Date('2026-08-07T12:00:00Z'),
      pausedSeconds: 0,
      hourlyRate: 100000,
      tiers: [],
      promotion: {
        ruleId: 'promo-1',
        name: 'Giảm 10%',
        discountType: 'PERCENT',
        discountValue: 10,
      },
    })
    // subtotal 200k, giảm 10% = 20k
    expect(result.subtotal).toBe(200000)
    expect(result.promotionDiscount).toBe(20000)
    expect(result.grandTotal).toBe(180000)
  })

  it('FIXED_AMOUNT clamp: khuyến mại không vượt subtotal', () => {
    const result = calculatePlayerPrice({
      startTime,
      endTime: new Date('2026-08-07T10:30:00Z'),
      pausedSeconds: 0,
      hourlyRate: 100000,
      tiers: [],
      promotion: {
        ruleId: 'promo-2',
        name: 'Giảm 500k',
        discountType: 'FIXED_AMOUNT',
        discountValue: 500000,
      },
    })
    // subtotal 50k < 500k → discount clamp 50k, grandTotal 0
    expect(result.subtotal).toBe(50000)
    expect(result.promotionDiscount).toBe(50000)
    expect(result.grandTotal).toBe(0)
  })

  it('PERCENT_PLAY_TIME clamp: giảm vượt 100% chỉ về 0, không âm', () => {
    const result = calculatePlayerPrice({
      startTime,
      endTime: new Date('2026-08-07T11:00:00Z'),
      pausedSeconds: 0,
      hourlyRate: 100000,
      tiers: [],
      promotion: {
        ruleId: 'promo-3',
        name: 'Giảm 150%',
        discountType: 'PERCENT_PLAY_TIME',
        discountValue: 150,
      },
    })
    // subtotal 100k, giảm clamp về 100k → grandTotal 0
    expect(result.subtotal).toBe(100000)
    expect(result.promotionDiscount).toBe(100000)
    expect(result.grandTotal).toBe(0)
  })
})

// ── calculateSessionPriceFromLoaded — snapshot-first, member = 0đ, không fallback giá ──

describe('calculateSessionPriceFromLoaded', () => {
  const endTime = new Date('2026-08-07T12:00:00Z')

  function makeDeps(overrides: Partial<Parameters<typeof calculateSessionPriceFromLoaded>[0]> = {}) {
    return {
      session: { findByIdForCheckout: vi.fn() },
      membership: { findActive: vi.fn(async () => null) },
      pricing: { findApplicableRule: vi.fn(async () => null) },
      ...overrides,
    }
  }

  function makeSession(overrides: Partial<SessionWithDetails> = {}): SessionWithDetails {
    return {
      id: 'session-1',
      customerId: null,
      customerName: null,
      customer: { id: 'cust-1', fullName: 'Khách A', type: 'WALK_IN' },
      membership: null,
      startTime: new Date('2026-08-07T10:00:00Z'),
      hourlyRate: 50000,
      pricingGroups: [],
      ...overrides,
    } as unknown as SessionWithDetails
  }

  it('hội viên còn hạn → isMemberSession true, tiền giờ 0đ', async () => {
    const session = makeSession({
      customer: { id: 'cust-1', fullName: 'Khách A', type: 'MEMBER' },
      membership: { id: 'mem-1', expiresAt: new Date('2026-08-20T00:00:00Z') },
    })
    const result = await calculateSessionPriceFromLoaded(makeDeps(), session, endTime)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.isMemberSession).toBe(true)
    expect(result.value.grandTotal).toBe(0)
    expect(result.value.subtotal).toBe(0)
  })

  it('hội viên hết hạn tại thời điểm thu tiền → membershipExpired true', async () => {
    const session = makeSession({
      customer: { id: 'cust-1', fullName: 'Khách A', type: 'MEMBER' },
      membership: { id: 'mem-1', expiresAt: new Date('2026-08-01T00:00:00Z') },
    })
    const result = await calculateSessionPriceFromLoaded(makeDeps(), session, endTime)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.membershipExpired).toBe(true)
    expect(result.value.isMemberSession).toBe(false)
  })

  it('khách vãng lai, session chưa snapshot + không có rule → PRICING_RULE_NOT_FOUND (không fallback giá mặc định)', async () => {
    const session = makeSession({ hourlyRate: 0 })
    const result = await calculateSessionPriceFromLoaded(makeDeps(), session, endTime)

    expect(result).toEqual({ ok: false, error: { code: 'PRICING_RULE_NOT_FOUND' } })
  })

  it('khách vãng lai, session có hourlyRate > 0 (legacy) → tính theo rate đó', async () => {
    const session = makeSession({ hourlyRate: 100000 })
    const result = await calculateSessionPriceFromLoaded(makeDeps(), session, endTime)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    // 2h × 100k = 200k
    expect(result.value.totalHours).toBe(2)
    expect(result.value.grandTotal).toBe(200000)
  })
})
