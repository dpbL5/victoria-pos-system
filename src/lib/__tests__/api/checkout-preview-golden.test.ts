import fs from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

// ── Golden fixtures cho checkout-preview ────────────────────────────────
// Chụp output của route hiện tại trước khi thay bằng checkout-quote.
// Chạy UPDATE_GOLDEN=1 để tạo/cập nhật fixture; sau đó commit 2 so quote mới
// với chính các file này.

const fakeRepositories = vi.hoisted(() => ({
  session: {
    findByIdWithPlayers: vi.fn(),
    findSellItems: vi.fn(),
  },
  pricing: {
    findManyByIdsWithTiers: vi.fn(),
    findApplicableRule: vi.fn(),
  },
  promotions: { findAvailableById: vi.fn() },
  product: { findManyByIds: vi.fn() },
  settings: { getNumeric: vi.fn() },
}))

vi.mock('@/lib/infrastructure/repositories', () => ({ repositories: fakeRepositories }))
vi.mock('@/lib/infrastructure/prisma', () => ({ prisma: { $transaction: vi.fn() } }))
vi.mock('@/lib/shared/auth', () => ({
  requireAuth: vi.fn(async () => ({
    userId: 'staff-1',
    username: 'nv_a',
    fullName: 'Nhân viên A',
    role: 'STAFF',
  })),
}))

import { GET as previewGet } from '@/app/api/sessions/[id]/checkout-preview/route'
import { quoteCheckout } from '@/lib/sessions/checkout-quote'
import type { CheckoutQuoteDeps } from '@/lib/sessions/checkout-quote'
import type { QuoteSession } from '@/lib/sessions/checkout-quote-core'
import { toCheckoutSelection } from '@/lib/sessions/session-validations'

const AT = new Date('2026-10-19T10:00:00+07:00')
const END = new Date('2026-10-19T11:00:00+07:00')
const START = new Date('2026-10-19T09:00:00+07:00')
const SESSION_ID = 'session-1'
const P1 = '11111111-1111-4111-8111-111111111111'
const P2 = '22222222-2222-4222-8222-222222222222'
const RULE_100_ID = '55555555-5555-4555-8555-555555555555'
const RULE_80_ID = '66666666-6666-4666-8666-666666666666'

const RULE_100 = {
  id: RULE_100_ID,
  name: 'Giờ thường',
  ratePerHour: 100_000,
  tiers: [],
  daysOfWeek: [],
  effectiveFrom: new Date('2026-01-01T00:00:00+07:00'),
  effectiveTo: null,
}

const RULE_80 = {
  ...RULE_100,
  id: RULE_80_ID,
  name: 'Giờ khuyến mãi',
  ratePerHour: 80_000,
}

const SNAPSHOT_100 = {
  ruleId: RULE_100.id,
  name: RULE_100.name,
  ratePerHour: 100_000,
  tiers: [],
}

const PROMOTION_10 = {
  ruleId: 'promo-1',
  name: 'Giảm 10%',
  discountType: 'PERCENT',
  discountValue: 10,
}

const PRODUCTS = [
  { id: 'prod-1', name: 'Nước suối', type: 'PRODUCT', price: 30_000, stockQuantity: 10, isActive: true },
]

function player(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    sessionId: SESSION_ID,
    groupId: 'group-1',
    name: null,
    pausedAt: null,
    totalPausedSeconds: 0,
    checkedOutAt: null,
    position: 0,
    createdAt: START,
    ...over,
  }
}

function group(over: Record<string, unknown> = {}) {
  return {
    id: 'group-1',
    sessionId: SESSION_ID,
    label: 'Nhóm 1',
    playerCount: 1,
    remainingCount: 1,
    hourlyRate: 0,
    pricingRuleId: null,
    pricingSnapshot: null,
    createdAt: START,
    players: [player(P1)],
    ...over,
  }
}

function session(over: Record<string, unknown> = {}) {
  return {
    id: SESSION_ID,
    customerId: null,
    customerName: 'Khách #001',
    staffId: 'staff-1',
    shiftId: 'shift-1',
    startTime: START,
    endTime: null,
    pausedAt: null,
    totalPausedSeconds: 0,
    status: 'ACTIVE',
    hourlyRate: 0,
    pricingRuleId: null,
    pricingRuleSnapshot: null,
    customer: null,
    membership: null,
    booking: null,
    playerCount: 1,
    pricingGroups: [group()],
    ...over,
  }
}

interface Scenario {
  name: string
  session: Record<string, unknown>
  sellItems?: unknown[]
  query?: Record<string, string>
  promotion?: unknown
}

const SCENARIOS: Scenario[] = [
  {
    name: 'fresh-auto-rule',
    session: session(),
    query: { endTime: END.toISOString(), pricingRuleId: RULE_100.id },
  },
  {
    name: 'fresh-two-groups',
    session: session({
      playerCount: 2,
      pricingGroups: [
        group({
          playerCount: 2,
          remainingCount: 2,
          players: [player(P1), player(P2, { position: 1 })],
        }),
      ],
    }),
    query: {
      endTime: END.toISOString(),
      groups: JSON.stringify([
        { playerCount: 1, pricingRuleId: RULE_100.id, playerIds: [P1] },
        { playerCount: 1, pricingRuleId: RULE_80.id, playerIds: [P2] },
      ]),
    },
  },
  {
    name: 'priced-player-slice',
    session: session({
      playerCount: 2,
      pricingGroups: [
        group({
          playerCount: 2,
          remainingCount: 1,
          hourlyRate: 100_000,
          pricingRuleId: RULE_100.id,
          pricingSnapshot: SNAPSHOT_100,
          players: [
            player(P1, { checkedOutAt: new Date('2026-10-19T10:00:00+07:00') }),
            player(P2, { position: 1 }),
          ],
        }),
      ],
    }),
    query: { endTime: END.toISOString(), playerIds: JSON.stringify([P2]) },
  },
  {
    name: 'member-sell-item',
    session: session({
      customerId: 'customer-1',
      customer: { id: 'customer-1', fullName: 'Hội viên A', type: 'MEMBER' },
      membership: {
        id: 'membership-1',
        startsAt: START,
        expiresAt: new Date('2026-12-31T00:00:00+07:00'),
      },
    }),
    sellItems: [{
      id: 'si-1',
      sessionId: SESSION_ID,
      productId: 'prod-1',
      quantity: 1,
      unitPrice: 30_000,
      notes: null,
      createdAt: START,
    }],
    query: { endTime: END.toISOString() },
  },
  {
    name: 'legacy-no-group',
    session: session({ playerCount: 2, pricingGroups: [] }),
    query: {
      endTime: END.toISOString(),
      playerCount: '2',
      pricingRuleId: RULE_100.id,
    },
  },
  {
    name: 'promotion',
    session: session({
      hourlyRate: 100_000,
      pricingRuleId: RULE_100.id,
      pricingRuleSnapshot: SNAPSHOT_100,
      pricingGroups: [
        group({
          hourlyRate: 100_000,
          pricingRuleId: RULE_100.id,
          pricingSnapshot: SNAPSHOT_100,
        }),
      ],
    }),
    promotion: PROMOTION_10,
    query: { endTime: END.toISOString(), promotionRuleId: 'promo-1' },
  },
]

const FIXTURE_DIR = path.join(
  process.cwd(),
  'src/lib/__tests__/fixtures/checkout-preview'
)
const UPDATE_GOLDEN = process.env.UPDATE_GOLDEN === '1'

function previewUrl(query: Record<string, string> = {}) {
  const params = new URLSearchParams(query)
  const qs = params.toString()
  return `http://localhost/api/sessions/${SESSION_ID}/checkout-preview${qs ? `?${qs}` : ''}`
}

async function callPreview(scenario: Scenario) {
  fakeRepositories.session.findByIdWithPlayers.mockResolvedValue(scenario.session)
  fakeRepositories.session.findSellItems.mockResolvedValue(scenario.sellItems ?? [])
  fakeRepositories.promotions.findAvailableById.mockResolvedValue(scenario.promotion ?? null)
  fakeRepositories.pricing.findManyByIdsWithTiers.mockImplementation(
    async (ids: string[]) => [RULE_100, RULE_80].filter((rule) => ids.includes(rule.id))
  )
  fakeRepositories.pricing.findApplicableRule.mockResolvedValue(RULE_100)
  fakeRepositories.product.findManyByIds.mockResolvedValue(PRODUCTS)
  fakeRepositories.settings.getNumeric.mockResolvedValue(5_000)

  const request = new NextRequest(previewUrl(scenario.query), { method: 'GET' })
  const response = await previewGet(request, {
    params: Promise.resolve({ id: SESSION_ID }),
  })
  return { status: response.status, json: await response.json() }
}

function scenarioSelection(query: Record<string, string> = {}) {
  return toCheckoutSelection({
    groups: query.groups ? JSON.parse(query.groups) : undefined,
    playerIds: query.playerIds ? JSON.parse(query.playerIds) : undefined,
    pricingGroupId: query.pricingGroupId,
    playerCount: query.playerCount ? Number(query.playerCount) : undefined,
  })
}

/** Các field preview cũ trả — bỏ các field receipt mới (charges/total/...). */
function comparableQuote(quote: Record<string, unknown>) {
  return {
    sessionId: quote.sessionId,
    totalHours: quote.totalHours,
    hourlyRate: quote.hourlyRate,
    subtotal: quote.subtotal,
    discountAmount: quote.discountAmount,
    grandTotal: quote.grandTotal,
    isMemberSession: quote.isMemberSession,
    promotion: quote.promotion,
    pendingSellTotal: quote.pendingSellTotal,
    pendingSellItems: quote.pendingSellItems,
    playerCount: quote.playerCount,
    pricingGroupId: quote.pricingGroupId,
    pricingGroups: quote.pricingGroups,
    parkingFeeUnitPrice: quote.parkingFeeUnitPrice,
    pausedSeconds: quote.pausedSeconds,
  }
}

describe('checkout-preview golden fixtures', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  for (const scenario of SCENARIOS) {
    it(`golden: ${scenario.name}`, async () => {
      const { status, json } = await callPreview(scenario)
      expect(status).toBe(200)

      const file = path.join(FIXTURE_DIR, `${scenario.name}.json`)
      if (UPDATE_GOLDEN) {
        fs.mkdirSync(FIXTURE_DIR, { recursive: true })
        fs.writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`)
      }

      const expected = JSON.parse(fs.readFileSync(file, 'utf8'))
      // Fixture giữ output preview CŨ làm oracle tiền; route mới được phép
      // thêm field receipt (charges/total/payable) và playerPricing chi tiết.
      expect(comparableQuote((json as { data: Record<string, unknown> }).data)).toEqual(
        comparableQuote(expected.data)
      )
    })

    it(`quote module matches preview golden: ${scenario.name}`, async () => {
      const { json } = await callPreview(scenario)
      const expected = JSON.parse(
        fs.readFileSync(path.join(FIXTURE_DIR, `${scenario.name}.json`), 'utf8')
      ) as { data: Record<string, unknown> }

      const result = await quoteCheckout(
        fakeRepositories as unknown as CheckoutQuoteDeps,
        scenario.session as unknown as QuoteSession,
        scenarioSelection(scenario.query),
        {
          endTime: END,
          quoteAt: AT,
          promotionRuleId: scenario.query?.promotionRuleId,
          pricingRuleId: scenario.query?.pricingRuleId,
        }
      )

      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(comparableQuote(result.value.quote as unknown as Record<string, unknown>)).toEqual(
        comparableQuote(expected.data)
      )
      expect(json.success).toBe(true)
    })
  }
})
