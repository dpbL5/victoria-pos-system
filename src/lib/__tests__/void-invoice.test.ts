import { describe, it, expect, vi } from 'vitest'

// Mock prisma singleton — test runVoidInvoice trực tiếp với fake repositories,
// không chạy transaction thật (không cần database).
vi.mock('@/lib/infrastructure/prisma', () => ({ prisma: {} }))

import { runVoidInvoice, type VoidInvoiceInput } from '@/lib/invoicing/use-cases/void-invoice'
import { RollbackSignal } from '@/lib/infrastructure/db-helpers'
import type { Repositories } from '@/lib/infrastructure/repositories'
import type { VoidInvoiceTarget, VoidInvoiceItemRef } from '@/lib/invoicing/ports'

function makeInvoice(overrides: Partial<VoidInvoiceTarget> = {}): VoidInvoiceTarget {
  return {
    id: 'inv-1',
    invoiceNo: 'INV-20260807-0001',
    grandTotal: 150000,
    status: 'PAID',
    notes: null,
    shiftId: 'shift-1',
    sessionId: 'session-1',
    items: [
      {
        id: 'item-1',
        type: 'PRODUCT',
        productId: 'prod-1',
        stockMovements: [
          { id: 'sm-1', productId: 'prod-1', quantity: 2, unitCost: 25000 },
        ],
      },
    ],
    staff: { fullName: 'Nhân viên A' },
    ...overrides,
  }
}

function makeRepositories(overrides: Partial<Repositories['billing']> = {}): Repositories {
  return {
    billing: {
      findVoidTarget: vi.fn(async () => makeInvoice()),
      findMergedDraftItems: vi.fn(async (): Promise<VoidInvoiceItemRef[]> => []),
      reverseStock: vi.fn(async () => {}),
      markInvoiceCancelled: vi.fn(async () => {}),
      createPaidInvoice: vi.fn(async () => ({ id: 'inv-x', invoiceNo: 'INV-X' })),
      createPayment: vi.fn(async () => ({ id: 'pay-x' })),
      createMembershipPayment: vi.fn(async () => ({ id: 'mp-x' })),
      createDraftInvoice: vi.fn(async () => ({ id: 'inv-x', invoiceNo: 'SEL-X' })),
      createInvoiceItem: vi.fn(async () => ({ id: 'item-x' })),
      updateInvoiceTotals: vi.fn(async () => {}),
      findDraftInvoices: vi.fn(async () => []),
      cancelDraftInvoices: vi.fn(async () => {}),
      findByIdForEdit: vi.fn(async () => null),
      deleteInvoiceItems: vi.fn(async () => {}),
      deletePayments: vi.fn(async () => {}),
      updateInvoiceFinancials: vi.fn(async () => {}),
      findByIdWithDetails: vi.fn(),
      findByIdForDelete: vi.fn(),
      countLinkedTransactions: vi.fn(async () => ({ payments: 0, stockMovements: 0 })),
      deleteInvoiceWithItems: vi.fn(async () => {}),
      findDraftSellPreview: vi.fn(),
      findInvoicesByCustomer: vi.fn(),
      countPaidBySession: vi.fn(async () => 0),
      ...overrides,
    },
    audit: {
      append: vi.fn(async () => {}),
      findMany: vi.fn(),
    },
    membership: {
      findLatest: vi.fn(async () => null),
      findActive: vi.fn(async () => null),
      create: vi.fn(),
      findManyByCustomer: vi.fn(),
    },
    membershipPlan: { findById: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), countUsage: vi.fn(), delete: vi.fn() },
    customer: { findById: vi.fn(), findByIdIncludingDeleted: vi.fn(), findByIdWithCount: vi.fn(), create: vi.fn(), findMany: vi.fn(), update: vi.fn(), softDelete: vi.fn(), addSpend: vi.fn(), recordPlay: vi.fn(), findByPhone: vi.fn(), countWalkInsBetween: vi.fn() },
    shift: {
      findOpenForStaff: vi.fn(),
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
    promotions: {
      findAvailable: vi.fn(),
      findAvailableById: vi.fn(),
      findOverlapping: vi.fn(),
      findMany: vi.fn(),
      findById: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    settings: { get: vi.fn(), getNumeric: vi.fn(), upsert: vi.fn(), getWithLabel: vi.fn(), findAll: vi.fn() },
    session: {
      findByIdForCheckout: vi.fn(),
      findByIdWithCustomer: vi.fn(),
      findActiveByCustomer: vi.fn(),
      findMany: vi.fn(),
      findByIdForPreview: vi.fn(),
      findDraftSellTotals: vi.fn(),
      countCreatedBetween: vi.fn(async () => 0),
      createWithRefs: vi.fn(),
      createPricingGroup: vi.fn(async () => ({ id: 'group-1' })),
      createPlayersForGroup: vi.fn(async () => {}),
      updatePricingGroup: vi.fn(),
      update: vi.fn(),
      decrementGroupRemaining: vi.fn(),
      sumRemainingPlayers: vi.fn(),
      findByIdWithPlayers: vi.fn(),
      findPlayersForPause: vi.fn(),
      pausePlayer: vi.fn(),
      resumePlayer: vi.fn(),
      renamePlayer: vi.fn(),
      markPlayersCheckedOut: vi.fn(),
      movePlayersToGroup: vi.fn(async () => {}),
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
      list: vi.fn(async () => ({ entries: [], total: 0, page: 1, pageSize: 10 })),
      summarize: vi.fn(),
    },
    user: { findByUsername: vi.fn(), findById: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), findActiveOpenShiftParticipants: vi.fn() },
    tool: { findMany: vi.fn(), findById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    student: { findMany: vi.fn(), findById: vi.fn(), findByIdIncludingDeleted: vi.fn(), create: vi.fn(), update: vi.fn(), softDelete: vi.fn() },
    lesson: { findManyBetween: vi.fn(), findById: vi.fn(), findBySeries: vi.fn(), findUpcomingByStudent: vi.fn(), findPastByStudent: vi.fn(), create: vi.fn(), update: vi.fn(), cancel: vi.fn(), setGoogleEventId: vi.fn(), deleteFutureBySeries: vi.fn(), countLessonsByStudent: vi.fn(), upsertAttendance: vi.fn(), setPackage: vi.fn() },
    lessonSeries: { findById: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    lessonPackage: { findById: vi.fn(), findActiveByStudent: vi.fn(), create: vi.fn(), update: vi.fn(), incrementUsed: vi.fn() },
    calendarConnection: { find: vi.fn(async () => null), upsert: vi.fn(), updateToken: vi.fn(), delete: vi.fn() },
    reporting: {
      getDashboardData: vi.fn(),
      getRevenueData: vi.fn(),
      getRevenueExportRows: vi.fn(),
      getSessionExportRows: vi.fn(),
      getShiftDayGroups: vi.fn(),
      getShiftRevenue: vi.fn(),
      getShiftRevenues: vi.fn(),
      getTrends: vi.fn(),
      getTopProducts: vi.fn(),
    },
  }
}

async function expectVoidError(
  repos: Repositories,
  input: VoidInvoiceInput,
  code: string
) {
  let caught: RollbackSignal | null = null
  try {
    await runVoidInvoice(repos, input)
  } catch (error) {
    if (error instanceof RollbackSignal) caught = error
    else throw error
  }
  expect(caught?.error.code).toBe(code)
}

const input: VoidInvoiceInput = { invoiceId: 'inv-1', staffId: 'staff-1', reason: 'Ghi nhầm' }

describe('runVoidInvoice', () => {
  it('trả INVOICE_NOT_FOUND khi hoá đơn không tồn tại', async () => {
    const repos = makeRepositories({ findVoidTarget: vi.fn(async () => null) })
    await expectVoidError(repos, input, 'INVOICE_NOT_FOUND')
    expect(repos.billing.findVoidTarget).toHaveBeenCalledWith('inv-1')
  })

  it('trả INVOICE_NOT_VOIDABLE khi hoá đơn không phải PAID', async () => {
    const repos = makeRepositories({
      findVoidTarget: vi.fn(async () => makeInvoice({ status: 'DRAFT' })),
    })
    await expectVoidError(repos, input, 'INVOICE_NOT_VOIDABLE')
  })

  it('trả SHIFT_CLOSED khi hoá đơn không gán ca', async () => {
    const repos = makeRepositories({
      findVoidTarget: vi.fn(async () => makeInvoice({ shiftId: null })),
    })
    await expectVoidError(repos, input, 'SHIFT_CLOSED')
  })

  it('hoàn trả tồn kho, đánh dấu CANCELLED và ghi audit khi thành công', async () => {
    const repos = makeRepositories()
    const result = await runVoidInvoice(repos, input)

    expect(result).toEqual({
      invoiceId: 'inv-1',
      invoiceNo: 'INV-20260807-0001',
      status: 'CANCELLED',
      reversedStockItems: 2,
    })

    // reverseStock: 1 lần cho item của hoá đơn PAID
    expect(repos.billing.reverseStock).toHaveBeenCalledTimes(1)
    expect(repos.billing.reverseStock).toHaveBeenCalledWith({
      invoiceItemId: 'item-1',
      productId: 'prod-1',
      shiftId: 'shift-1',
      staffId: 'staff-1',
      quantity: 2,
      unitCost: 25000,
      reason: 'Huỷ hoá đơn INV-20260807-0001 bởi Nhân viên A: Ghi nhầm',
    })

    expect(repos.billing.markInvoiceCancelled).toHaveBeenCalledTimes(1)
    const [, notes] = (repos.billing.markInvoiceCancelled as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(notes).toContain('Huỷ hoá đơn INV-20260807-0001 bởi Nhân viên A: Ghi nhầm')

    expect(repos.audit.append).toHaveBeenCalledTimes(1)
    const auditCall = (repos.audit.append as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(auditCall.action).toBe('INVOICE_VOID')
    expect(auditCall.entityId).toBe('inv-1')
    expect(auditCall.details).toMatchObject({
      invoiceNo: 'INV-20260807-0001',
      statusBefore: 'PAID',
      statusAfter: 'CANCELLED',
      grandTotal: 150000,
      reversedStockItems: 2,
      reason: 'Ghi nhầm',
      shiftId: 'shift-1',
    })
  })

  it('hoàn trả tồn kho cho cả DRAFT invoice đã merge', async () => {
    const repos = makeRepositories({
      findMergedDraftItems: vi.fn(async (): Promise<VoidInvoiceItemRef[]> => [
        {
          id: 'item-draft',
          type: 'PRODUCT',
          productId: 'prod-2',
          stockMovements: [{ id: 'sm-2', productId: 'prod-2', quantity: 1, unitCost: 20000 }],
        },
      ]),
    })
    const result = await runVoidInvoice(repos, input)

    expect(result.reversedStockItems).toBe(3)
    expect(repos.billing.findMergedDraftItems).toHaveBeenCalledWith('session-1', 'INV-20260807-0001')
    expect(repos.billing.reverseStock).toHaveBeenCalledTimes(2)
    // Lần 2 là item từ draft
    expect(repos.billing.reverseStock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        invoiceItemId: 'item-draft',
        productId: 'prod-2',
        quantity: 1,
      })
    )
  })

  it('không tạo reverseStock khi hoá đơn không có sản phẩm', async () => {
    const repos = makeRepositories({
      findVoidTarget: vi.fn(async () =>
        makeInvoice({
          items: [{ id: 'item-2', type: 'SERVICE', productId: null, stockMovements: [] }],
        })
      ),
    })
    const result = await runVoidInvoice(repos, input)
    expect(result.reversedStockItems).toBe(0)
    expect(repos.billing.reverseStock).not.toHaveBeenCalled()
  })
})
