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
    customer: { findById: vi.fn(), findByIdIncludingDeleted: vi.fn(), findByIdWithCount: vi.fn(), create: vi.fn(), findMany: vi.fn(), update: vi.fn(), softDelete: vi.fn(), addSpend: vi.fn(), recordPlay: vi.fn(), countWalkInsBetween: vi.fn() },
    shift: {
      findOpenForStaff: vi.fn(async () => ({ id: 'shift-1' }) as never),
      findOpenOperational: vi.fn(),
      findByIdForClose: vi.fn(),
      calculateExpectedCash: vi.fn(),
      markParticipantsLeft: vi.fn(),
      upsertToolCloseCount: vi.fn(),
      upsertToolOpenCount: vi.fn(),
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
      countCreatedBetween: vi.fn(async () => 0),
      createWithRefs: vi.fn(async () => ({
        id: 'session-1',
        customerId: 'cust-1',
        staffId: 'staff-1',
        shiftId: 'shift-1',
        membershipId: null,
        startTime: new Date('2026-08-07T10:00:00Z'),
        hourlyRate: 0,
        pricingRuleId: null,
        pricingRuleSnapshot: null,
        playerCount: 1,
        status: 'ACTIVE',
        customer: { id: 'cust-1', fullName: 'Khách A', type: 'WALK_IN' },
        membership: null,
        shift: { id: 'shift-1', openedAt: new Date('2026-08-07T08:00:00Z'), status: 'OPEN' },
      }) as never),
      createPricingGroup: vi.fn(async () => ({ id: 'group-1' })),
      createPlayersForGroup: vi.fn(async () => {}),
      updatePricingGroup: vi.fn(async () => {}),
      update: vi.fn(),
      decrementGroupRemaining: vi.fn(),
      sumRemainingPlayers: vi.fn(),
      findByIdWithPlayers: vi.fn(),
      pausePlayer: vi.fn(),
      resumePlayer: vi.fn(),
      markPlayersCheckedOut: vi.fn(),
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
      getShiftRevenues: vi.fn(),
    },
  }
  return { ...base, ...overrides }
}

function makeInput(overrides: Partial<CheckInTxInput> = {}): CheckInTxInput {
  return {
    staffId: 'staff-1',
    customerId: 'cust-1',
    customerName: null,
    playerCount: 1,
    now: new Date('2026-08-07T10:00:00Z'),
    membershipId: undefined,
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

  it('khách vãng lai: không tạo Customer — lưu tên trên phiên + pricing group trống giá + audit', async () => {
    const repos = makeRepositories({
      session: {
        ...makeRepositories().session,
        countCreatedBetween: vi.fn(async () => 4),
      },
    })
    const result = await runCheckInTx(repos, makeInput({ customerId: null, customerName: 'Nguyễn Văn A' }))

    // Không còn tạo customer ẩn danh
    expect(repos.customer.create).not.toHaveBeenCalled()
    expect(repos.session.createWithRefs).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: null, customerName: 'Nguyễn Văn A', staffId: 'staff-1', playerCount: 1 })
    )
    // Bảng giá để trống lúc check-in — chọn khi thu tiền
    expect(repos.session.createWithRefs).toHaveBeenCalledWith(
      expect.objectContaining({ hourlyRate: 0, pricingRuleId: null, pricingRuleSnapshot: null })
    )
    expect(repos.session.createPricingGroup).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'session-1', label: 'Nhóm 1', playerCount: 1, hourlyRate: 0, pricingSnapshot: null })
    )
    expect(repos.audit.append).toHaveBeenCalledTimes(1)
    const auditCall = (repos.audit.append as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(auditCall.action).toBe('SESSION_CHECK_IN')
    expect(auditCall.details).toMatchObject({ customerType: 'WALK_IN', playerCount: 1, customerName: 'Nguyễn Văn A' })
    expect(auditCall.details.hourlyRate).toBeUndefined()
    expect(auditCall.details.pricingRuleId).toBeUndefined()

    expect(result.hourlyRate).toBe(0)
  })

  it('khách vãng lai không nhập tên: tự đặt Khách #NNN theo số phiên trong ngày', async () => {
    const repos = makeRepositories({
      session: {
        ...makeRepositories().session,
        countCreatedBetween: vi.fn(async () => 4),
      },
    })
    await runCheckInTx(repos, makeInput({ customerId: null, customerName: null }))

    expect(repos.customer.create).not.toHaveBeenCalled()
    expect(repos.session.createWithRefs).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: null, customerName: 'Khách #005' })
    )
  })

  it('WALK_IN nhóm nhiều người: luôn tạo 1 pricing group trống giá theo playerCount', async () => {
    const repos = makeRepositories({
      session: {
        ...makeRepositories().session,
        countCreatedBetween: vi.fn(async () => 0),
      },
    })
    await runCheckInTx(repos, makeInput({
      customerId: null,
      customerName: 'Nhóm khách',
      playerCount: 3,
      totalPlayers: 3,
    }))

    const groupCalls = (repos.session.createPricingGroup as ReturnType<typeof vi.fn>).mock.calls
    expect(groupCalls).toHaveLength(1)
    expect(groupCalls[0][0]).toMatchObject({ label: 'Nhóm 1', playerCount: 3, remainingCount: 3, hourlyRate: 0, pricingSnapshot: null })
    expect(repos.session.createWithRefs).toHaveBeenCalledWith(
      expect.objectContaining({ playerCount: 3, hourlyRate: 0, pricingRuleId: null })
    )
  })

  it('không tạo customer mới khi check-in khách đã đăng ký (WALK_IN đăng ký: bảng giá để trống)', async () => {
    const repos = makeRepositories()
    const result = await runCheckInTx(repos, makeInput())

    expect(repos.customer.create).not.toHaveBeenCalled()
    expect(repos.session.createWithRefs).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: 'cust-1', hourlyRate: 0, pricingRuleId: null })
    )
    expect(result.hourlyRate).toBe(0)
  })

  it('hội viên: hourlyRate = 0 và không cần pricing snapshot', async () => {
    const repos = makeRepositories()
    const result = await runCheckInTx(repos, makeInput({ membershipId: 'mem-1' }))

    expect(repos.session.createWithRefs).toHaveBeenCalledWith(
      expect.objectContaining({ membershipId: 'mem-1', hourlyRate: 0, pricingRuleId: null })
    )
    expect(repos.session.createPricingGroup).toHaveBeenCalledWith(
      expect.objectContaining({ hourlyRate: 0, pricingSnapshot: null })
    )
    expect(result.hourlyRate).toBe(0)
  })
})
