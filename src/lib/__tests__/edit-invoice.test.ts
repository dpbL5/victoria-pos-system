import { describe, it, expect, vi } from 'vitest'

// Mock prisma singleton — test runEditInvoice trực tiếp với fake repositories (Pattern A,
// giống void-invoice.test.ts). Không chạy transaction thật.
vi.mock('@/lib/infrastructure/prisma', () => ({ prisma: {} }))

import { runEditInvoice, type EditInvoiceInput } from '@/lib/invoicing/use-cases/edit-invoice'
import { RollbackSignal } from '@/lib/infrastructure/db-helpers'
import type { Repositories } from '@/lib/infrastructure/repositories'
import type { EditInvoiceTarget } from '@/lib/invoicing/ports'
import type { ProductRecord } from '@/lib/sessions/ports'

function makeInvoice(overrides: Partial<EditInvoiceTarget> = {}): EditInvoiceTarget {
  return {
    id: 'inv-1',
    invoiceNo: 'INV-20260807-0001',
    status: 'PAID',
    shiftId: 'shift-1',
    customerId: 'cust-1',
    sessionId: 'session-1',
    paidAt: new Date('2026-08-07T12:00:00Z'),
    notes: null,
    subtotal: 30000,
    discountTotal: 0,
    grandTotal: 30000,
    staff: { fullName: 'Nhân viên A' },
    items: [
      {
        id: 'item-1',
        type: 'PRODUCT',
        productId: 'prod-1',
        description: 'Nước suối',
        quantity: 2,
        unitPrice: 15000,
        subtotal: 30000,
        discountAmount: 0,
        total: 30000,
        metadata: null,
        stockMovements: [{ id: 'sm-1', productId: 'prod-1', quantity: 2 }],
      },
    ],
    payments: [{ id: 'pay-1', totalHours: 2, paymentMethod: 'CASH', kind: 'OPERATIONAL' }],
    ...overrides,
  }
}

// Fake repositories đầy đủ 15 domain (mỗi method vi.fn()) — giống check-out.test.ts
function makeRepositories(overrides: Partial<Repositories> = {}): Repositories {
  return {
    billing: {
      findVoidTarget: vi.fn(),
      findMergedDraftItems: vi.fn(async () => []),
      reverseStock: vi.fn(async () => {}),
      markInvoiceCancelled: vi.fn(),
      createPaidInvoice: vi.fn(),
      createPayment: vi.fn(async () => ({ id: 'pay-1' })),
      createMembershipPayment: vi.fn(),
      createInvoiceItem: vi.fn(async () => ({ id: 'item-new' })),
      updateInvoiceTotals: vi.fn(),
      findByIdForEdit: vi.fn(async () => makeInvoice()),
      deleteInvoiceItems: vi.fn(async () => {}),
      deletePayments: vi.fn(async () => {}),
      updateInvoiceFinancials: vi.fn(async () => {}),
      findByIdWithDetails: vi.fn(),
      findByIdForDelete: vi.fn(),
      countLinkedTransactions: vi.fn(),
      deleteInvoiceWithItems: vi.fn(),
      findInvoicesByCustomer: vi.fn(),
      countPaidBySession: vi.fn(async () => 0),
    },
    audit: { append: vi.fn(async () => {}), findMany: vi.fn() },
    membership: { findLatest: vi.fn(), findActive: vi.fn(), create: vi.fn(), findManyByCustomer: vi.fn() },
    membershipPlan: { findById: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), countUsage: vi.fn(), delete: vi.fn() },
    customer: { findById: vi.fn(), findByIdIncludingDeleted: vi.fn(), findByIdWithCount: vi.fn(), create: vi.fn(), findMany: vi.fn(), update: vi.fn(), softDelete: vi.fn(), addSpend: vi.fn(async () => {}), recordPlay: vi.fn(), findByPhone: vi.fn(), countWalkInsBetween: vi.fn() },
    shift: {
      findOpenForStaff: vi.fn(), findOpenOperational: vi.fn(), findByIdForClose: vi.fn(), calculateExpectedCash: vi.fn(), markParticipantsLeft: vi.fn(),
      upsertToolCloseCount: vi.fn(), upsertToolOpenCount: vi.fn(), close: vi.fn(), upsertParticipant: vi.fn(), findByIdOrThrow: vi.fn(), createWithLead: vi.fn(),
      update: vi.fn(), findByIdWithToolStats: vi.fn(), findByIdAccess: vi.fn(), findManyWithCount: vi.fn(), findByIdExport: vi.fn(), adjustCashDifference: vi.fn(),
    },
    pricing: { findApplicableRule: vi.fn(), findByIdWithTiers: vi.fn(), getApplicableRules: vi.fn(), countApplicable: vi.fn(), countAll: vi.fn(), findOverlapping: vi.fn(), findManyWithTiers: vi.fn(), findById: vi.fn(), createWithTiers: vi.fn(), update: vi.fn(), deleteTiersByRule: vi.fn(), createTiers: vi.fn(), delete: vi.fn() },
    promotions: { findAvailable: vi.fn(), findAvailableById: vi.fn(), findOverlapping: vi.fn(), findMany: vi.fn(), findById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    settings: { get: vi.fn(), getNumeric: vi.fn(), upsert: vi.fn(), getWithLabel: vi.fn(), findAll: vi.fn() },
    session: {
      findByIdForCheckout: vi.fn(), findByIdWithCustomer: vi.fn(), findActiveByCustomer: vi.fn(), findMany: vi.fn(), findByIdForPreview: vi.fn(), findSellItemTotals: vi.fn(async () => ({})), findSellItems: vi.fn(async () => []), addSellItem: vi.fn(async () => {}), removeSellItems: vi.fn(async () => {}), clearSellItems: vi.fn(async () => {}),
      countCreatedBetween: vi.fn(), createWithRefs: vi.fn(), createPricingGroup: vi.fn(), createPlayersForGroup: vi.fn(), updatePricingGroup: vi.fn(), update: vi.fn(),
      decrementGroupRemaining: vi.fn(), sumRemainingPlayers: vi.fn(), findByIdWithPlayers: vi.fn(), findPlayersForPause: vi.fn(), pausePlayer: vi.fn(), resumePlayer: vi.fn(), pausePlayersForSession: vi.fn(), resumePlayersForSession: vi.fn(),
      renamePlayer: vi.fn(), movePlayersToGroup: vi.fn(), markPlayersCheckedOut: vi.fn(),
    },
    product: {
      findManyByIds: vi.fn(async (): Promise<ProductRecord[]> => [
        { id: 'prod-2', name: 'Trà sữa', type: 'PRODUCT', price: 25000, stockQuantity: 10, isActive: true },
      ]),
      findByIdForSale: vi.fn(async (): Promise<ProductRecord | null> => ({ id: 'prod-2', name: 'Trà sữa', type: 'PRODUCT', price: 25000, stockQuantity: 10, isActive: true })),
      decrementStockIfAvailable: vi.fn(async () => ({ count: 1 })),
      recordSaleMovement: vi.fn(async () => {}),
      findManyForAdmin: vi.fn(), findByIdAdmin: vi.fn(), createWithInitialStock: vi.fn(), applyStockMovement: vi.fn(),
      deactivate: vi.fn(),
      delete: vi.fn(),
      countUsage: vi.fn(),
    },
    cashflow: { create: vi.fn(), findById: vi.fn(), update: vi.fn(), delete: vi.fn(), list: vi.fn(), summarize: vi.fn() },
    user: { findByUsername: vi.fn(), findById: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), findActiveOpenShiftParticipants: vi.fn() },
    tool: { findMany: vi.fn(), findById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    reporting: {
      getDashboardData: vi.fn(), getRevenueData: vi.fn(), getRevenueExportRows: vi.fn(), getSessionExportRows: vi.fn(), getShiftDayGroups: vi.fn(), getShiftRevenue: vi.fn(),
      getShiftRevenues: vi.fn(), getTrends: vi.fn(), getTopProducts: vi.fn(),
    },
    student: { findMany: vi.fn(), findById: vi.fn(), findByIdIncludingDeleted: vi.fn(), create: vi.fn(), update: vi.fn(), softDelete: vi.fn() },
    lesson: { findManyBetween: vi.fn(), findById: vi.fn(), findBySeries: vi.fn(), findUpcomingByStudent: vi.fn(), findPastByStudent: vi.fn(), create: vi.fn(), update: vi.fn(), cancel: vi.fn(), setGoogleEventId: vi.fn(), deleteFutureBySeries: vi.fn(), countLessonsByStudent: vi.fn(), upsertAttendance: vi.fn(), setPackage: vi.fn() },
    lessonSeries: { findById: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    lessonPackage: { findById: vi.fn(), findActiveByStudent: vi.fn(), create: vi.fn(), update: vi.fn(), incrementUsed: vi.fn() },
    calendarConnection: { find: vi.fn(async () => null), upsert: vi.fn(), updateToken: vi.fn(), delete: vi.fn() },
    ...overrides,
  }
}

const input: EditInvoiceInput = {
  invoiceId: 'inv-1',
  staffId: 'staff-1',
  items: [{ productId: 'prod-2', quantity: 1 }],
  paymentMethod: 'CASH',
}

async function expectEditError(repos: Repositories, code: string, detail?: string) {
  let caught: RollbackSignal | null = null
  try {
    await runEditInvoice(repos, input)
  } catch (error) {
    if (error instanceof RollbackSignal) caught = error
    else throw error
  }
  expect(caught?.error.code).toBe(code)
  if (detail !== undefined) expect(caught?.error.detail).toBe(detail)
}

describe('runEditInvoice', () => {
  it('trả INVOICE_NOT_FOUND khi hoá đơn không tồn tại', async () => {
    const repos = makeRepositories({ billing: { ...makeRepositories().billing, findByIdForEdit: vi.fn(async () => null) } })
    await expectEditError(repos, 'INVOICE_NOT_FOUND')
  })

  it('trả INVOICE_NOT_EDITABLE khi hoá đơn không phải PAID', async () => {
    const repos = makeRepositories({
      billing: { ...makeRepositories().billing, findByIdForEdit: vi.fn(async () => makeInvoice({ status: 'DRAFT' })) },
    })
    await expectEditError(repos, 'INVOICE_NOT_EDITABLE')
  })

  it('trả SHIFT_CLOSED khi hoá đơn không gán ca', async () => {
    const repos = makeRepositories({
      billing: { ...makeRepositories().billing, findByIdForEdit: vi.fn(async () => makeInvoice({ shiftId: null })) },
    })
    await expectEditError(repos, 'SHIFT_CLOSED')
  })

  it('trả INVOICE_HAS_MEMBERSHIP khi hoá đơn có phí hội viên', async () => {
    const repos = makeRepositories({
      billing: {
        ...makeRepositories().billing,
        findByIdForEdit: vi.fn(async () => makeInvoice({ payments: [{ id: 'pay-m', totalHours: 0, paymentMethod: 'CASH', kind: 'MEMBERSHIP' }] })),
      },
    })
    await expectEditError(repos, 'INVOICE_HAS_MEMBERSHIP')
  })

  it('trả PRODUCT_NOT_FOUND khi sản phẩm mới không tồn tại', async () => {
    const repos = makeRepositories({ product: { ...makeRepositories().product, findManyByIds: vi.fn(async () => []) } })
    await expectEditError(repos, 'PRODUCT_NOT_FOUND')
  })

  it('trả INSUFFICIENT_STOCK kèm tên sản phẩm khi trừ kho thất bại', async () => {
    const repos = makeRepositories({
      product: { ...makeRepositories().product, decrementStockIfAvailable: vi.fn(async () => ({ count: 0 })) },
    })
    await expectEditError(repos, 'INSUFFICIENT_STOCK', 'Trà sữa')
  })

  it('sửa thành công: reverse stock cũ + apply stock mới + audit INVOICE_EDIT + cập nhật customer delta', async () => {
    const repos = makeRepositories()
    const result = await runEditInvoice(repos, input)

    expect(result.invoiceId).toBe('inv-1')
    expect(result.invoiceNo).toBe('INV-20260807-0001')

    // Reverse stock cho item cũ (Nước suối, qty 2)
    expect(repos.billing.reverseStock).toHaveBeenCalled()
    // Delete items + payment cũ
    expect(repos.billing.deleteInvoiceItems).toHaveBeenCalledWith('inv-1')
    expect(repos.billing.deletePayments).toHaveBeenCalledWith('inv-1')
    // Tạo item mới + trừ kho sản phẩm mới
    expect(repos.billing.createInvoiceItem).toHaveBeenCalled()
    expect(repos.product.decrementStockIfAvailable).toHaveBeenCalledWith('prod-2', 1)
    expect(repos.product.recordSaleMovement).toHaveBeenCalled()
    // Tạo payment mới
    expect(repos.billing.createPayment).toHaveBeenCalled()
    // Cập nhật financials
    expect(repos.billing.updateInvoiceFinancials).toHaveBeenCalledWith('inv-1', expect.any(Object))
    // Customer delta = newGrandTotal - oldGrandTotal
    expect(repos.customer.addSpend).toHaveBeenCalledWith('cust-1', expect.any(Number))
    // Audit INVOICE_EDIT
    const auditCall = (repos.audit.append as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(auditCall.action).toBe('INVOICE_EDIT')
    expect(auditCall.entityId).toBe('inv-1')
  })
})
