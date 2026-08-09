import { describe, it, expect, vi } from 'vitest'

// Mock prisma singleton — check-in.ts import runInTransaction (db-helpers → prisma).
// Test runCheckInTx trực tiếp với fake repositories, không chạy transaction thật.
vi.mock('@/lib/infrastructure/prisma', () => ({ prisma: {} }))

import { runCheckInTx, type CheckInTxInput } from '@/lib/sessions/use-cases/check-in'
import { RollbackSignal } from '@/lib/infrastructure/db-helpers'
import type { Repositories } from '@/lib/infrastructure/repositories'

function makeRepositories(overrides: Partial<Repositories> = {}): Repositories {
  const base: Repositories = {
    billing: {
      findVoidTarget: vi.fn(),
      findMergedDraftItems: vi.fn(),
      reverseStock: vi.fn(),
      markInvoiceCancelled: vi.fn(),
      createPaidInvoice: vi.fn(),
      createPayment: vi.fn(),
      createMembershipPayment: vi.fn(),
      createDraftInvoice: vi.fn(),
      createInvoiceItem: vi.fn(),
      updateInvoiceTotals: vi.fn(),
      findDraftInvoices: vi.fn(),
      cancelDraftInvoices: vi.fn(),
      findByIdForEdit: vi.fn(),
      deleteInvoiceItems: vi.fn(),
      deletePayments: vi.fn(),
      updateInvoiceFinancials: vi.fn(),
      findByIdWithDetails: vi.fn(),
      findByIdForDelete: vi.fn(),
      countLinkedTransactions: vi.fn(),
      deleteInvoiceWithItems: vi.fn(),
      findDraftSellPreview: vi.fn(),
    },
    audit: { append: vi.fn(async () => {}), findMany: vi.fn() },
    membership: { findLatest: vi.fn(), findActive: vi.fn(), create: vi.fn(), findManyByCustomer: vi.fn() },
    membershipPlan: { findById: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), countUsage: vi.fn(), delete: vi.fn() },
    customer: { findById: vi.fn(), findByIdWithCount: vi.fn(), create: vi.fn(), findMany: vi.fn(), update: vi.fn(), addSpend: vi.fn(), recordPlay: vi.fn(), countWalkInsBetween: vi.fn() },
    shift: {
      findOpenForStaff: vi.fn(async () => ({ id: 'shift-1' }) as never),
      findOpenOperational: vi.fn(),
      findByIdForClose: vi.fn(),
      calculateExpectedCash: vi.fn(),
      markParticipantsLeft: vi.fn(),
      upsertToolCloseCount: vi.fn(),
      close: vi.fn(),
      upsertParticipant: vi.fn(),
      findByIdOrThrow: vi.fn(),
      createWithLead: vi.fn(),
      update: vi.fn(),
      findByIdWithToolStats: vi.fn(),
      findByIdAccess: vi.fn(),
      findManyWithCount: vi.fn(),
      findByIdExport: vi.fn(),
      adjustCashDifference: vi.fn(),
    },
    pricing: {
      findApplicableRule: vi.fn(),
      findByIdWithTiers: vi.fn(),
      getApplicableRules: vi.fn(),
      countApplicable: vi.fn(),
      countAll: vi.fn(),
      findOverlapping: vi.fn(),
      findManyWithTiers: vi.fn(),
      findById: vi.fn(),
      createWithTiers: vi.fn(),
      update: vi.fn(),
      deleteTiersByRule: vi.fn(),
      createTiers: vi.fn(),
      delete: vi.fn(),
    },
    promotions: { findAvailable: vi.fn(), findAvailableById: vi.fn(), findOverlapping: vi.fn(), findMany: vi.fn(), findById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    settings: { get: vi.fn(), getNumeric: vi.fn(), upsert: vi.fn(), getWithLabel: vi.fn(), findAll: vi.fn() },
    session: {
      findByIdForCheckout: vi.fn(),
      findByIdWithCustomer: vi.fn(),
      findActiveByCustomer: vi.fn(),
      findMany: vi.fn(),
      findByIdForPreview: vi.fn(),
      findDraftSellTotals: vi.fn(),
      createWithRefs: vi.fn(async () => ({
        id: 'session-1',
        customerId: 'cust-1',
        staffId: 'staff-1',
        shiftId: 'shift-1',
        membershipId: null,
        startTime: new Date('2026-08-07T10:00:00Z'),
        hourlyRate: 50000,
        pricingRuleId: 'rule-1',
        pricingRuleSnapshot: {
          ruleId: 'rule-1',
          name: 'Giờ vàng',
          ratePerHour: 50000,
          tiers: [],
        },
        playerCount: 1,
        status: 'ACTIVE',
        customer: { id: 'cust-1', fullName: 'Khách A', type: 'WALK_IN' },
        membership: null,
        shift: { id: 'shift-1', openedAt: new Date('2026-08-07T08:00:00Z'), status: 'OPEN' },
      }) as never),
      createPricingGroup: vi.fn(async () => {}),
      update: vi.fn(),
      decrementGroupRemaining: vi.fn(),
      sumRemainingPlayers: vi.fn(),
    },
    product: {
      findManyByIds: vi.fn(),
      findByIdForSale: vi.fn(),
      decrementStockIfAvailable: vi.fn(),
      recordSaleMovement: vi.fn(),
      findManyForAdmin: vi.fn(),
      findByIdAdmin: vi.fn(),
      createWithInitialStock: vi.fn(),
      applyStockMovement: vi.fn(),
    },
    cashflow: {
      create: vi.fn(),
      findById: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      list: vi.fn(),
      summarize: vi.fn(),
    },
    user: { findByUsername: vi.fn(), findById: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), findActiveOpenShiftParticipants: vi.fn() },
    tool: { findMany: vi.fn(), findById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    reporting: {
      getDashboardData: vi.fn(),
      getRevenueData: vi.fn(),
      getRevenueExportRows: vi.fn(),
      getSessionExportRows: vi.fn(),
      getShiftDayGroups: vi.fn(),
      getShiftRevenue: vi.fn(),
    },
  }
  return { ...base, ...overrides }
}

function makeInput(overrides: Partial<CheckInTxInput> = {}): CheckInTxInput {
  return {
    staffId: 'staff-1',
    customerId: 'cust-1',
    pricingRuleId: 'rule-1',
    playerCount: 1,
    groups: null as never,
    now: new Date('2026-08-07T10:00:00Z'),
    pricingRuleSnapshot: {
      ruleId: 'rule-1',
      name: 'Giờ vàng',
      ratePerHour: 50000,
      tiers: [],
    },
    hourlyRate: 50000,
    membershipId: undefined,
    resolvedGroups: null as never,
    totalPlayers: 1,
    ...overrides,
  }
}

async function expectTxError(repos: Repositories, input: CheckInTxInput, code: string) {
  let caught: RollbackSignal | null = null
  try {
    await runCheckInTx(repos, input)
  } catch (error) {
    if (error instanceof RollbackSignal) caught = error
    else throw error
  }
  expect(caught?.error.code).toBe(code)
}

describe('runCheckInTx', () => {
  it('trả SHIFT_REQUIRED khi chưa có ca mở', async () => {
    const repos = makeRepositories({
      shift: {
        ...makeRepositories().shift,
        findOpenForStaff: vi.fn(async () => null),
      },
    })
    await expectTxError(repos, makeInput(), 'SHIFT_REQUIRED')
    expect(repos.session.createWithRefs).not.toHaveBeenCalled()
  })

  it('tạo khách vãng lai ẩn danh + session + pricing group + audit', async () => {
    const repos = makeRepositories({
      customer: {
        ...makeRepositories().customer,
        countWalkInsBetween: vi.fn(async () => 4),
        create: vi.fn(async () => ({ id: 'anon-5', fullName: 'Khách #005', type: 'WALK_IN' }) as never),
      },
    })
    const result = await runCheckInTx(repos, makeInput({ customerId: null }))

    expect(repos.customer.create).toHaveBeenCalledWith({ fullName: 'Khách #005', type: 'WALK_IN' })
    expect(repos.session.createWithRefs).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: 'anon-5', staffId: 'staff-1', playerCount: 1 })
    )
    expect(repos.session.createPricingGroup).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'session-1', label: 'Nhóm 1', playerCount: 1 })
    )
    expect(repos.audit.append).toHaveBeenCalledTimes(1)
    const auditCall = (repos.audit.append as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(auditCall.action).toBe('SESSION_CHECK_IN')
    expect(auditCall.details).toMatchObject({ customerType: 'WALK_IN', groupCount: 1 })

    expect(result.hourlyRate).toBe(50000)
  })

  it('tạo pricing groups riêng khi có groups', async () => {
    const repos = makeRepositories({
      customer: {
        ...makeRepositories().customer,
        countWalkInsBetween: vi.fn(async () => 0),
        create: vi.fn(async () => ({ id: 'anon-1', fullName: 'Khách #001', type: 'WALK_IN' }) as never),
      },
    })
    const input = makeInput({
      customerId: null,
      playerCount: 3,
      resolvedGroups: [
        { playerCount: 2, pricingRuleId: 'rule-1', pricingRuleSnapshot: { ruleId: 'rule-1', name: 'Giờ vàng', ratePerHour: 50000, tiers: [] } },
        { playerCount: 1, pricingRuleId: 'rule-2', pricingRuleSnapshot: { ruleId: 'rule-2', name: 'Giờ tối', ratePerHour: 40000, tiers: [] } },
      ],
      totalPlayers: 3,
      hourlyRate: 50000,
    })
    const result = await runCheckInTx(repos, input)

    const groupCalls = (repos.session.createPricingGroup as ReturnType<typeof vi.fn>).mock.calls
    expect(groupCalls).toHaveLength(2)
    expect(groupCalls[0][0]).toMatchObject({ label: 'Nhóm 1', playerCount: 2, hourlyRate: 50000 })
    expect(groupCalls[1][0]).toMatchObject({ label: 'Nhóm 2', playerCount: 1, hourlyRate: 40000 })
    expect(repos.session.createWithRefs).toHaveBeenCalledWith(
      expect.objectContaining({ playerCount: 3 })
    )
  })

  it('không tạo customer mới khi check-in khách đã đăng ký', async () => {
    const repos = makeRepositories()
    const result = await runCheckInTx(repos, makeInput())

    expect(repos.customer.create).not.toHaveBeenCalled()
    expect(repos.session.createWithRefs).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: 'cust-1', hourlyRate: 50000 })
    )
    expect(result.hourlyRate).toBe(50000)
  })

  it('hội viên: hourlyRate = 0 và không cần pricing snapshot', async () => {
    const repos = makeRepositories()
    const result = await runCheckInTx(repos, makeInput({ membershipId: 'mem-1', hourlyRate: 0, pricingRuleId: undefined, pricingRuleSnapshot: null }))

    expect(repos.session.createWithRefs).toHaveBeenCalledWith(
      expect.objectContaining({ membershipId: 'mem-1', hourlyRate: 0, pricingRuleId: undefined })
    )
    expect(repos.session.createPricingGroup).toHaveBeenCalledWith(
      expect.objectContaining({ hourlyRate: 0, pricingSnapshot: null })
    )
  })
})
