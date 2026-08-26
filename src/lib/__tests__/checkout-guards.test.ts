import { describe, it, expect, vi } from 'vitest'

// Mock prisma singleton — checkOut gọi runInTransaction (db-helpers → prisma).
vi.mock('@/lib/infrastructure/prisma', () => ({ prisma: {} }))

import { checkOut, type CheckoutInput } from '@/lib/sessions/use-cases/check-out'
import type { Repositories } from '@/lib/infrastructure/repositories'
import type { SessionWithPlayers } from '@/lib/sessions/ports'

function makeSession(overrides: Record<string, unknown> = {}): SessionWithPlayers {
  return {
    id: 'session-1',
    customerId: 'cust-1',
    customerName: null,
    membershipId: null,
    staffId: 'staff-1',
    shiftId: 'shift-1',
    startTime: new Date('2026-08-07T10:00:00Z'),
    endTime: null,
    status: 'ACTIVE',
    playerCount: 1,
    hourlyRate: 0,
    customer: { id: 'cust-1', fullName: 'Khách A', type: 'WALK_IN' },
    membership: null,
    pricingGroups: [
      {
        id: 'group-1',
        label: 'Nhóm 1',
        playerCount: 1,
        remainingCount: 1,
        hourlyRate: 0,
        pricingRuleId: null,
        pricingSnapshot: null,
        players: [{ id: 'player-1', name: '', pausedAt: null, totalPausedSeconds: 0, checkedOutAt: null }],
      },
    ],
    ...overrides,
  } as unknown as SessionWithPlayers
}

function makeRepositories(overrides: Partial<Repositories> = {}): Repositories {
  const base: Repositories = {
    billing: {
      findVoidTarget: vi.fn(), findMergedDraftItems: vi.fn(), reverseStock: vi.fn(), markInvoiceCancelled: vi.fn(),
      createPaidInvoice: vi.fn(async () => ({ id: 'inv-1', invoiceNo: 'INV-1' })), createPayment: vi.fn(async () => ({ id: 'pay-1' })),
      createMembershipPayment: vi.fn(), createInvoiceItem: vi.fn(async () => ({ id: 'item-1' })),
      updateInvoiceTotals: vi.fn(),
      findByIdForEdit: vi.fn(), deleteInvoiceItems: vi.fn(), deletePayments: vi.fn(), updateInvoiceFinancials: vi.fn(),
      findByIdWithDetails: vi.fn(), findByIdForDelete: vi.fn(), countLinkedTransactions: vi.fn(), deleteInvoiceWithItems: vi.fn(),
      findInvoicesByCustomer: vi.fn(), countPaidBySession: vi.fn(async () => 0),
    },
    audit: { append: vi.fn(async () => {}), findMany: vi.fn() },
    membership: { findLatest: vi.fn(), findActive: vi.fn(async () => null), create: vi.fn(), findManyByCustomer: vi.fn() },
    membershipPlan: { findById: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), countUsage: vi.fn(), delete: vi.fn() },
    customer: { findById: vi.fn(), findByIdIncludingDeleted: vi.fn(), findByIdWithCount: vi.fn(), create: vi.fn(), findMany: vi.fn(), update: vi.fn(), softDelete: vi.fn(), addSpend: vi.fn(async () => {}), recordPlay: vi.fn(async () => {}), findByPhone: vi.fn(), countWalkInsBetween: vi.fn() },
    shift: {
      findOpenForStaff: vi.fn(async () => ({ id: 'shift-1' }) as never), findOpenOperational: vi.fn(), findByIdForClose: vi.fn(), calculateExpectedCash: vi.fn(), markParticipantsLeft: vi.fn(),
      upsertToolCloseCount: vi.fn(), upsertToolOpenCount: vi.fn(), close: vi.fn(), upsertParticipant: vi.fn(), findByIdOrThrow: vi.fn(), createWithLead: vi.fn(),
      update: vi.fn(), findByIdWithToolStats: vi.fn(), findByIdAccess: vi.fn(), findManyWithCount: vi.fn(), findByIdExport: vi.fn(), adjustCashDifference: vi.fn(),
    },
    pricing: { findApplicableRule: vi.fn(async () => null), findByIdWithTiers: vi.fn(async () => null), getApplicableRules: vi.fn(), countApplicable: vi.fn(), countAll: vi.fn(), findOverlapping: vi.fn(), findManyWithTiers: vi.fn(), findById: vi.fn(), createWithTiers: vi.fn(), update: vi.fn(), deleteTiersByRule: vi.fn(), createTiers: vi.fn(), delete: vi.fn() },
    promotions: { findAvailable: vi.fn(), findAvailableById: vi.fn(async () => null), findOverlapping: vi.fn(), findMany: vi.fn(), findById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    settings: { get: vi.fn(), getNumeric: vi.fn(async () => 0), upsert: vi.fn(), getWithLabel: vi.fn(), findAll: vi.fn() },
    session: {
      findByIdForCheckout: vi.fn(), findByIdWithCustomer: vi.fn(), findActiveByCustomer: vi.fn(), findMany: vi.fn(), findByIdForPreview: vi.fn(), findSellItemTotals: vi.fn(async () => ({})), findSellItems: vi.fn(async () => []), addSellItem: vi.fn(async () => {}), removeSellItems: vi.fn(async () => {}), clearSellItems: vi.fn(async () => {}),
      countCreatedBetween: vi.fn(), createWithRefs: vi.fn(), createPricingGroup: vi.fn(), createPlayersForGroup: vi.fn(), updatePricingGroup: vi.fn(), update: vi.fn(),
      decrementGroupRemaining: vi.fn(), sumRemainingPlayers: vi.fn(async () => 0), findByIdWithPlayers: vi.fn(async () => makeSession()),
      findPlayersForPause: vi.fn(), pausePlayer: vi.fn(), resumePlayer: vi.fn(), renamePlayer: vi.fn(), movePlayersToGroup: vi.fn(), markPlayersCheckedOut: vi.fn(),
    },
    product: {
      findManyByIds: vi.fn(async () => []), findByIdForSale: vi.fn(), decrementStockIfAvailable: vi.fn(async () => ({ count: 1 })), recordSaleMovement: vi.fn(async () => {}),
      findManyForAdmin: vi.fn(), findByIdAdmin: vi.fn(), createWithInitialStock: vi.fn(), applyStockMovement: vi.fn(),
    },
    cashflow: { create: vi.fn(), findById: vi.fn(), update: vi.fn(), delete: vi.fn(), list: vi.fn(), summarize: vi.fn() },
    user: { findByUsername: vi.fn(), findById: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), findActiveOpenShiftParticipants: vi.fn() },
    tool: { findMany: vi.fn(), findById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    student: { findMany: vi.fn(), findById: vi.fn(), findByIdIncludingDeleted: vi.fn(), create: vi.fn(), update: vi.fn(), softDelete: vi.fn() },
    lesson: { findManyBetween: vi.fn(), findById: vi.fn(), findBySeries: vi.fn(), findUpcomingByStudent: vi.fn(), findPastByStudent: vi.fn(), create: vi.fn(), update: vi.fn(), cancel: vi.fn(), setGoogleEventId: vi.fn(), deleteFutureBySeries: vi.fn(), countLessonsByStudent: vi.fn(), upsertAttendance: vi.fn(), setPackage: vi.fn() },
    lessonSeries: { findById: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    lessonPackage: { findById: vi.fn(), findActiveByStudent: vi.fn(), create: vi.fn(), update: vi.fn(), incrementUsed: vi.fn() },
    calendarConnection: { find: vi.fn(async () => null), upsert: vi.fn(), updateToken: vi.fn(), delete: vi.fn() },
    reporting: {
      getDashboardData: vi.fn(), getRevenueData: vi.fn(), getRevenueExportRows: vi.fn(), getSessionExportRows: vi.fn(), getShiftDayGroups: vi.fn(), getShiftRevenue: vi.fn(),
      getShiftRevenues: vi.fn(), getTrends: vi.fn(), getTopProducts: vi.fn(),
    },
  }
  return { ...base, ...overrides }
}

function makeInput(overrides: Partial<CheckoutInput> = {}): CheckoutInput {
  return {
    sessionId: 'session-1',
    staffId: 'staff-1',
    paymentMethod: 'CASH',
    items: [],
    ...overrides,
  }
}

describe('checkOut — guard trước transaction (business invariants)', () => {
  it('trả SESSION_NOT_FOUND khi phiên không tồn tại', async () => {
    const repos = makeRepositories({
      session: { ...makeRepositories().session, findByIdWithPlayers: vi.fn(async () => null) },
    })
    const result = await checkOut(makeInput(), repos)
    expect(result).toEqual({ ok: false, error: { code: 'SESSION_NOT_FOUND' } })
  })

  it('trả SESSION_COMPLETED khi phiên đã kết thúc', async () => {
    const repos = makeRepositories({
      session: { ...makeRepositories().session, findByIdWithPlayers: vi.fn(async () => makeSession({ status: 'COMPLETED' })) },
    })
    const result = await checkOut(makeInput(), repos)
    expect(result).toEqual({ ok: false, error: { code: 'SESSION_COMPLETED' } })
  })

  it('trả END_TIME_BEFORE_START khi endTime trước startTime', async () => {
    const repos = makeRepositories()
    const result = await checkOut(
      makeInput({ endTime: new Date('2026-08-07T09:00:00Z') }),
      repos
    )
    expect(result).toEqual({ ok: false, error: { code: 'END_TIME_BEFORE_START' } })
  })

  it('trả PRICING_RULE_NOT_FOUND khi khách vãng lai chưa gán giá và không có rule hiệu lực', async () => {
    // session hourlyRate = 0, group chưa snapshot → cần resolve pricing, findApplicableRule null
    const repos = makeRepositories()
    const result = await checkOut(makeInput(), repos)
    expect(result).toEqual({ ok: false, error: { code: 'PRICING_RULE_NOT_FOUND' } })
  })

  it('trả PROMOTION_UNAVAILABLE khi promotion đã hết hiệu lực', async () => {
    // Session có sẵn snapshot giá → không cần resolve rule, nhưng promotion không khả dụng
    const pricedSession = makeSession({
      hourlyRate: 100000,
      pricingGroups: [
        {
          id: 'group-1', label: 'Nhóm 1', playerCount: 1, remainingCount: 1, hourlyRate: 100000,
          pricingRuleId: 'rule-1',
          pricingSnapshot: { ruleId: 'rule-1', name: 'Giờ thường', ratePerHour: 100000, tiers: [] },
          players: [{ id: 'player-1', name: '', pausedAt: null, totalPausedSeconds: 0, checkedOutAt: null }],
        },
      ],
    })
    const repos = makeRepositories({
      session: { ...makeRepositories().session, findByIdWithPlayers: vi.fn(async () => pricedSession) },
    })
    const result = await checkOut(makeInput({ promotionRuleId: 'promo-gone' }), repos)
    expect(result).toEqual({ ok: false, error: { code: 'PROMOTION_UNAVAILABLE' } })
  })

  it('trả PROMOTION_NOT_APPLICABLE khi hội viên xin khuyến mại', async () => {
    const memberSession = makeSession({
      customer: { id: 'cust-1', fullName: 'Khách A', type: 'MEMBER' },
      membership: { id: 'mem-1', expiresAt: new Date('2026-08-20T00:00:00Z') },
      pricingGroups: [],
    })
    const baseSession = makeRepositories().session
    const repos = makeRepositories({
      session: {
        ...baseSession,
        findByIdWithPlayers: vi.fn(async () => memberSession),
        // pricing engine gọi findByIdForCheckout (SessionWithDetails) — trả cùng session
        findByIdForCheckout: vi.fn(async () => memberSession as never),
      },
      // Hội viên còn hiệu lực — để guard PROMOTION_NOT_APPLICABLE được kiểm tra (không vướng MEMBERSHIP_EXPIRED)
      membership: { ...makeRepositories().membership, findActive: vi.fn(async () => ({ id: 'mem-1', customerId: 'cust-1', planId: 'plan-1', status: 'ACTIVE', startsAt: new Date('2026-08-01T00:00:00Z'), expiresAt: new Date('2026-08-30T00:00:00Z'), createdAt: new Date(), updatedAt: new Date(), plan: { id: 'plan-1', name: 'Gói tháng', price: 300000, durationMonths: 1, isActive: true, createdAt: new Date(), updatedAt: new Date() } } as never)) },
      promotions: { ...makeRepositories().promotions, findAvailableById: vi.fn(async () => ({ ruleId: 'promo-1', name: 'Giảm', discountType: 'PERCENT' as const, discountValue: 10 })) },
    })
    const result = await checkOut(makeInput({ promotionRuleId: 'promo-1' }), repos)
    expect(result).toEqual({ ok: false, error: { code: 'PROMOTION_NOT_APPLICABLE' } })
  })

  it('trả GROUP_PLAYER_COUNT_MISMATCH khi tổng người các nhóm vượt playerCount', async () => {
    const session = makeSession({
      hourlyRate: 0,
      pricingGroups: [
        {
          id: 'group-1', label: 'Nhóm 1', playerCount: 1, remainingCount: 1, hourlyRate: 0,
          pricingRuleId: null, pricingSnapshot: null,
          players: [{ id: 'player-1', name: '', pausedAt: null, totalPausedSeconds: 0, checkedOutAt: null }],
        },
      ],
    })
    const repos = makeRepositories({
      session: { ...makeRepositories().session, findByIdWithPlayers: vi.fn(async () => session) },
    })
    // 2 nhóm, mỗi nhóm 1 người → tổng 2 > playerCount 1
    const result = await checkOut(
      makeInput({
        groups: [
          { playerCount: 1, pricingRuleId: 'rule-1', playerIds: ['player-1'] },
          { playerCount: 1, pricingRuleId: 'rule-2', playerIds: ['player-2'] },
        ],
      }),
      repos
    )
    expect(result).toEqual({ ok: false, error: { code: 'GROUP_PLAYER_COUNT_MISMATCH' } })
  })
})
