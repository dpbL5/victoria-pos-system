import { describe, it, expect, vi } from 'vitest'
import { calculatePlayerPrice } from '@/lib/sessions'
import { quoteCheckout } from '@/lib/sessions/checkout-quote'
import type { CheckoutQuoteDeps } from '@/lib/sessions/checkout-quote'
import type { QuoteSession } from '@/lib/sessions/checkout-quote-core'

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

// ── quoteCheckout — base pricing: snapshot-first, member = 0đ, không fallback giá ──

describe('quoteCheckout — base pricing', () => {
  const endTime = new Date('2026-08-07T12:00:00Z')
  const startTime = new Date('2026-08-07T10:00:00Z')

  function makeDeps(): CheckoutQuoteDeps {
    return {
      session: { findSellItems: vi.fn(async () => []) },
      pricing: {
        findManyByIdsWithTiers: vi.fn(async () => []),
        findApplicableRule: vi.fn(async () => null),
      },
      promotions: { findAvailableById: vi.fn(async () => null) },
      membership: { findActive: vi.fn(async () => null) },
      settings: { getNumeric: vi.fn(async () => 0) },
      product: { findManyByIds: vi.fn(async () => []) },
    } as CheckoutQuoteDeps
  }

  function makeSession(overrides: Partial<QuoteSession> = {}): QuoteSession {
    return {
      id: 'session-1',
      customerId: null,
      startTime,
      playerCount: 1,
      pausedAt: null,
      totalPausedSeconds: 0,
      hourlyRate: 50_000,
      pricingRuleSnapshot: null,
      customer: { type: 'WALK_IN' },
      membership: null,
      booking: null,
      pricingGroups: [],
      ...overrides,
    }
  }

  function run(session: QuoteSession) {
    return quoteCheckout(makeDeps(), session, { mode: 'all' }, { endTime, quoteAt: endTime })
  }

  it('hội viên còn hạn → isMemberSession true, tiền giờ 0đ', async () => {
    const result = await run(
      makeSession({
        customer: { type: 'MEMBER' },
        membership: { expiresAt: new Date('2026-08-20T00:00:00Z') },
      })
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.quote.isMemberSession).toBe(true)
    expect(result.value.quote.grandTotal).toBe(0)
    expect(result.value.quote.subtotal).toBe(0)
  })

  it('hội viên hết hạn tại thời điểm thu tiền → MEMBERSHIP_EXPIRED_DURING_CHECKOUT', async () => {
    const result = await run(
      makeSession({
        customer: { type: 'MEMBER' },
        membership: { expiresAt: new Date('2026-08-01T00:00:00Z') },
      })
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('MEMBERSHIP_EXPIRED_DURING_CHECKOUT')
    }
  })

  it('khách vãng lai, session chưa snapshot + không có rule → PRICING_RULE_NOT_FOUND', async () => {
    const result = await run(makeSession({ hourlyRate: 0 }))

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('PRICING_RULE_NOT_FOUND')
    }
  })

  it('khách vãng lai, session có hourlyRate > 0 (legacy) → tính theo rate đó', async () => {
    const result = await run(makeSession({ hourlyRate: 100_000 }))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    // 2h × 100k = 200k
    expect(result.value.quote.totalHours).toBe(2)
    expect(result.value.quote.grandTotal).toBe(200_000)
  })
})
