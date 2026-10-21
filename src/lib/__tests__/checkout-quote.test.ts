import { describe, expect, it } from 'vitest'
import { quoteCheckout as runQuoteCheckout } from '@/lib/sessions/checkout-quote'
import type { CheckoutQuoteDeps } from '@/lib/sessions/checkout-quote'
import type {
  QuoteGroup,
  QuotePlayer,
  QuoteRule,
  QuoteSession,
} from '@/lib/sessions/checkout-quote-core'

const AT = new Date('2026-10-19T10:00:00+07:00')
const END = new Date('2026-10-19T11:00:00+07:00')
const START = new Date('2026-10-19T09:00:00+07:00')

const RULE_100: QuoteRule = {
  id: 'rule-100',
  name: 'Giờ thường',
  ratePerHour: 100_000,
  tiers: [],
  daysOfWeek: [],
  effectiveFrom: new Date('2026-01-01T00:00:00+07:00'),
  effectiveTo: null,
}

const RULE_80: QuoteRule = {
  ...RULE_100,
  id: 'rule-80',
  name: 'Giờ khuyến mãi',
  ratePerHour: 80_000,
}

const SNAPSHOT_100 = {
  ruleId: RULE_100.id,
  name: RULE_100.name,
  ratePerHour: 100_000,
  tiers: [],
}

const PRODUCTS = [
  { id: 'prod-1', name: 'Nước suối', type: 'PRODUCT' as const, price: 30_000, stockQuantity: 10, isActive: true },
  { id: 'svc-1', name: 'Thuê cung', type: 'SERVICE' as const, price: 50_000, stockQuantity: 0, isActive: true },
]

function player(id: string, over: Partial<QuotePlayer> = {}): QuotePlayer {
  return {
    id,
    name: `Người ${id}`,
    pausedAt: null,
    totalPausedSeconds: 0,
    checkedOutAt: null,
    position: 0,
    ...over,
  }
}

function group(over: Partial<QuoteGroup> = {}): QuoteGroup {
  return {
    id: 'group-1',
    label: 'Nhóm 1',
    playerCount: 1,
    remainingCount: 1,
    hourlyRate: 0,
    pricingRuleId: null,
    pricingSnapshot: null,
    players: [player('p1')],
    ...over,
  }
}

function session(over: Partial<QuoteSession> = {}): QuoteSession {
  return {
    id: 'session-1',
    customerId: null,
    startTime: START,
    playerCount: 1,
    pausedAt: null,
    totalPausedSeconds: 0,
    hourlyRate: 0,
    pricingRuleSnapshot: null,
    customer: null,
    membership: null,
    booking: null,
    pricingGroups: [group()],
    ...over,
  }
}

function deps(over: Partial<Record<keyof CheckoutQuoteDeps, unknown>> = {}): CheckoutQuoteDeps {
  const base = {
    session: { findSellItems: async () => [] },
    pricing: {
      findManyByIdsWithTiers: async (ids: string[]) =>
        [RULE_100, RULE_80].filter((rule) => ids.includes(rule.id)),
      findApplicableRule: async () => RULE_100,
    },
    promotions: {
      findAvailableById: async () => ({
        ruleId: 'promo-1',
        name: 'Giảm 10%',
        discountType: 'PERCENT' as const,
        discountValue: 10,
      }),
    },
    membership: { findActive: async () => null },
    settings: { getNumeric: async () => 5_000 },
    product: {
      findManyByIds: async (ids: string[]) => PRODUCTS.filter((product) => ids.includes(product.id)),
    },
  }
  return { ...base, ...over } as unknown as CheckoutQuoteDeps
}

async function quote(
  sessionInput: QuoteSession,
  selection: Parameters<typeof runQuoteCheckout>[2],
  options: Parameters<typeof runQuoteCheckout>[3],
  depsInput = deps()
) {
  const result = await runQuoteCheckout(depsInput, sessionInput, selection, options)
  if (!result.ok) throw new Error(result.error.code)
  return result.value
}

describe('quoteCheckout — selection + per-player pricing', () => {
  it('phiên mới, auto/explicit rule: 2 người chơi 2h × 100k = 400k', async () => {
    const value = await quote(
      session({
        playerCount: 2,
        pricingGroups: [
          group({
            playerCount: 2,
            remainingCount: 2,
            players: [player('p1'), player('p2', { position: 1 })],
          }),
        ],
      }),
      { mode: 'all' },
      { endTime: END, quoteAt: AT, pricingRuleId: RULE_100.id }
    )

    expect(value.quote.subtotal).toBe(400_000)
    expect(value.quote.grandTotal).toBe(400_000)
    expect(value.quote.totalHours).toBe(4)
    expect(value.quote.playerPricing?.map((entry) => entry.total)).toEqual([200_000, 200_000])
    expect(value.assignments).toHaveLength(1)
    expect(value.assignments[0].snapshot.ratePerHour).toBe(100_000)
  })

  it('chia nhiều bảng giá: mỗi người dùng rule của nhóm mình', async () => {
    const value = await quote(
      session({
        playerCount: 2,
        pricingGroups: [
          group({
            playerCount: 2,
            remainingCount: 2,
            players: [player('p1'), player('p2', { position: 1 })],
          }),
        ],
      }),
      {
        mode: 'freshGroups',
        groups: [
          { playerCount: 1, pricingRuleId: RULE_100.id, playerIds: ['p1'] },
          { playerCount: 1, pricingRuleId: RULE_80.id, playerIds: ['p2'] },
        ],
      },
      { endTime: END, quoteAt: AT }
    )

    expect(value.quote.subtotal).toBe(360_000)
    expect(value.quote.playerPricing?.map((entry) => entry.total)).toEqual([200_000, 160_000])
    expect(value.assignments).toHaveLength(2)
    expect(value.assignments[1].groupId).toBeNull()
  })

  it('thu trước theo người: chỉ tính người chưa checkout, dùng snapshot của nhóm', async () => {
    const value = await quote(
      session({
        playerCount: 2,
        pricingGroups: [
          group({
            playerCount: 2,
            remainingCount: 1,
            hourlyRate: 100_000,
            pricingRuleId: RULE_100.id,
            pricingSnapshot: SNAPSHOT_100,
            players: [
              player('p1', { checkedOutAt: new Date('2026-10-19T10:00:00+07:00') }),
              player('p2', { position: 1 }),
            ],
          }),
        ],
      }),
      { mode: 'playerSlice', playerIds: ['p2'] },
      { endTime: END, quoteAt: AT }
    )

    expect(value.quote.subtotal).toBe(200_000)
    expect(value.quote.playerPricing).toHaveLength(1)
    expect(value.quote.playerPricing?.[0].id).toBe('p2')
    expect(value.assignments).toHaveLength(0)
  })

  it('thu một nhóm theo số người: lấy N người đầu chưa checkout', async () => {
    const value = await quote(
      session({
        playerCount: 2,
        pricingGroups: [
          group({
            playerCount: 2,
            remainingCount: 2,
            hourlyRate: 100_000,
            pricingRuleId: RULE_100.id,
            pricingSnapshot: SNAPSHOT_100,
            players: [player('p1'), player('p2', { position: 1 })],
          }),
        ],
      }),
      { mode: 'groupSlice', pricingGroupId: 'group-1', playerCount: 1 },
      { endTime: END, quoteAt: AT }
    )

    expect(value.quote.subtotal).toBe(200_000)
    expect(value.quote.playerPricing).toHaveLength(1)
    expect(value.quote.playerPricing?.[0].id).toBe('p1')
  })

  it('session cũ không có group: nhân theo số người checkout', async () => {
    const value = await quote(
      session({ playerCount: 2, pricingGroups: [] }),
      { mode: 'legacy', playerCount: 2 },
      { endTime: END, quoteAt: AT, pricingRuleId: RULE_100.id }
    )

    expect(value.quote.subtotal).toBe(400_000)
    expect(value.quote.grandTotal).toBe(400_000)
    expect(value.quote.playerPricing).toBeUndefined()
  })
})

describe('quoteCheckout — receipt chain', () => {
  it('cộng hàng hoá, trừ parking và cọc; hội viên active không tính giờ', async () => {
    const sellItem = {
      id: 'si-1',
      sessionId: 'session-1',
      productId: 'prod-1',
      quantity: 1,
      unitPrice: 30_000,
      notes: null,
      createdAt: new Date('2026-10-19T09:30:00+07:00'),
    }
    const value = await quote(
      session({
        customerId: 'customer-1',
        customer: { type: 'MEMBER' },
        membership: { expiresAt: new Date('2026-12-31T00:00:00+07:00') },
        booking: {
          id: 'booking-1',
          depositAmount: 20_000,
          depositAppliedAmount: 0,
          depositRefundedAmount: 0,
          depositInvoiceId: null,
          depositPaymentMethod: 'CASH',
        },
      }),
      { mode: 'all' },
      { endTime: END, quoteAt: AT, parkingVehicleCount: 1 },
      deps({ session: { findSellItems: async () => [sellItem] } })
    )

    expect(value.quote.isMemberSession).toBe(true)
    expect(value.quote.subtotal).toBe(0)
    expect(value.quote.pendingSellTotal).toBe(30_000)
    expect(value.quote.charges).toBe(30_000)
    expect(value.quote.total).toBe(25_000)
    expect(value.quote.depositApplied).toBe(20_000)
    expect(value.quote.payable).toBe(5_000)
    expect(value.quote.stockIssues).toBeUndefined()
  })

  it('khuyến mại áp trên tiền giờ từng người rồi cộng lại', async () => {
    const value = await quote(
      session(),
      { mode: 'all' },
      {
        endTime: END,
        quoteAt: AT,
        pricingRuleId: RULE_100.id,
        promotionRuleId: 'promo-1',
      }
    )

    expect(value.quote.subtotal).toBe(200_000)
    expect(value.quote.discountAmount).toBe(20_000)
    expect(value.quote.grandTotal).toBe(180_000)
    expect(value.quote.total).toBe(180_000)
    expect(value.quote.payable).toBe(180_000)
  })

  it('parking có thể đưa tổng về 0, không âm', async () => {
    const value = await quote(
      session(),
      { mode: 'all' },
      { endTime: END, quoteAt: AT, pricingRuleId: RULE_100.id, parkingVehicleCount: 100 }
    )

    expect(value.quote.total).toBe(0)
    expect(value.quote.payable).toBe(0)
  })

  it('báo stockIssues cho dòng hàng mới vượt tồn', async () => {
    const scarce = [
      { id: 'prod-1', name: 'Nước suối', type: 'PRODUCT' as const, price: 10_000, stockQuantity: 1, isActive: true },
    ]
    const value = await quote(
      session(),
      { mode: 'all' },
      {
        endTime: END,
        quoteAt: AT,
        pricingRuleId: RULE_100.id,
        items: [{ productId: 'prod-1', quantity: 2 }],
      },
      deps({ product: { findManyByIds: async () => scarce } })
    )

    expect(value.quote.stockIssues).toEqual([
      { productId: 'prod-1', productName: 'Nước suối', requested: 2, available: 1 },
    ])
  })

  it('hội viên hết hạn trả MEMBERSHIP_EXPIRED_DURING_CHECKOUT', async () => {
    const result = await runQuoteCheckout(
      deps(),
      session({ customerId: 'customer-1', customer: { type: 'MEMBER' } }),
      { mode: 'all' },
      { endTime: END, quoteAt: AT }
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('MEMBERSHIP_EXPIRED_DURING_CHECKOUT')
    }
  })
})
