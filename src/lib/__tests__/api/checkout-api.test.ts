import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Integration API test: POST /api/sessions/[id]/checkout ──
// Mock prisma (fake store) + auth. Kiểm tra hợp đồng HTTP + wiring use-case.

const fakeStore = vi.hoisted(() => {
  const store = {
    shift: { findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
    shiftParticipant: { findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn(), upsert: vi.fn() },
    membershipPlan: { findUnique: vi.fn(), findMany: vi.fn() },
    customer: { create: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn(), findMany: vi.fn() },
    membership: { create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
    session: {
      findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(),
    },
    sessionPricingGroup: { findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    sessionPlayer: { findMany: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    invoice: { create: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn(), delete: vi.fn() },
    invoiceItem: { create: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn() },
    payment: { create: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn(), count: vi.fn() },
    stockMovement: { create: vi.fn(), findMany: vi.fn() },
    product: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
    activityLog: { create: vi.fn(), findMany: vi.fn() },
    pricingRule: { findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
    pricingTier: { findMany: vi.fn(), create: vi.fn() },
    promotionRule: { findUnique: vi.fn(), findMany: vi.fn() },
    appSetting: { findUnique: vi.fn(), upsert: vi.fn(), findMany: vi.fn() },
    tool: { findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    shiftTool: { findUnique: vi.fn(), upsert: vi.fn() },
    cashflowEntry: { create: vi.fn(), update: vi.fn(), delete: vi.fn(), findMany: vi.fn() },
    user: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
  }
  return {
    ...store,
    $transaction: (work: (tx: unknown) => Promise<unknown>) => work(store),
  }
})

vi.mock('@/lib/infrastructure/prisma', () => ({ prisma: fakeStore }))

vi.mock('@/lib/shared/auth', () => ({
  requireAuth: vi.fn(async () => ({ userId: 'staff-1', username: 'nv_a', fullName: 'Nhân viên A', role: 'STAFF' })),
  requireAdmin: vi.fn(async () => { throw new Error('FORBIDDEN') }),
  requireMutationAuth: vi.fn(async () => ({ userId: 'staff-1', username: 'nv_a', fullName: 'Nhân viên A', role: 'STAFF' })),
}))

import { POST as checkoutHandler } from '@/app/api/sessions/[id]/checkout/route'
import { invoke } from '../helpers/api-test'

const SESSION_ID = '33333333-3333-4333-8333-333333333333'

// Session vãng lai chưa gán giá (hourlyRate 0) → cần resolve rule; mock pricingRule
const activeSession = {
  id: SESSION_ID,
  customerId: null,
  customerName: 'Khách lẻ',
  staffId: 'staff-1',
  shiftId: 'shift-1',
  startTime: new Date('2026-08-07T10:00:00Z'),
  status: 'ACTIVE',
  playerCount: 1,
  hourlyRate: 0,
  pricingRuleId: null,
  pricingRuleSnapshot: null,
  customer: null,
  membership: null,
  pricingGroups: [],
}

function resetMocks() {
  vi.clearAllMocks()
  fakeStore.shift.findFirst.mockResolvedValue({ id: 'shift-1' })
  // pricing rule hiệu lực để checkout không bị PRICING_RULE_NOT_FOUND
  fakeStore.pricingRule.findFirst.mockResolvedValue({
    id: 'rule-1', name: 'Giờ thường', ratePerHour: 100000, daysOfWeek: [], dayType: 'WEEKDAY',
    effectiveFrom: new Date('2026-01-01'), effectiveTo: null, tiers: [],
  })
  fakeStore.session.findUnique.mockImplementation(async (args: { include?: unknown }) => {
    // findByIdWithPlayers dùng include pricingGroups.players
    if (args.include) return activeSession
    return activeSession
  })
}

describe('POST /api/sessions/[id]/checkout', () => {
  beforeEach(resetMocks)

  it('trả 400 VALIDATION khi paymentMethod không hợp lệ', async () => {
    const { status, json } = await invoke(checkoutHandler, {
      params: { id: SESSION_ID },
      body: { paymentMethod: 'BITCOIN', items: [] },
    })
    expect(status).toBe(400)
    expect(json.code).toBe('VALIDATION')
  })

  it('trả 400 VALIDATION khi items có quantity <= 0', async () => {
    const { status, json } = await invoke(checkoutHandler, {
      params: { id: SESSION_ID },
      body: { paymentMethod: 'CASH', items: [{ productId: '44444444-4444-4444-8444-444444444444', quantity: 0 }] },
    })
    expect(status).toBe(400)
    expect(json.code).toBe('VALIDATION')
  })
})
