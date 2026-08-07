import { describe, it, expect, vi } from 'vitest'

// Mock prisma singleton — check-out.ts import runInTransaction (db-helpers → prisma).
// Test runCheckOutTx trực tiếp với fake repositories, không chạy transaction thật.
vi.mock('@/lib/infrastructure/prisma', () => ({ prisma: {} }))

import { runCheckOutTx, type CheckoutContext, type CheckoutTxState } from '@/lib/sessions/use-cases/check-out'
import { RollbackSignal } from '@/lib/infrastructure/db-helpers'
import type { Repositories } from '@/lib/infrastructure/repositories'
import type { SessionWithDetails } from '@/lib/sessions/ports'

function makeSession(): SessionWithDetails {
  return {
    id: 'session-1',
    customerId: 'cust-1',
    membershipId: null,
    staffId: 'staff-1',
    shiftId: 'shift-1',
    startTime: new Date('2026-08-07T10:00:00Z'),
    endTime: null,
    status: 'ACTIVE',
    playerCount: 2,
    hourlyRate: 50000,
    customer: { id: 'cust-1', fullName: 'Khách A', type: 'WALK_IN' },
    membership: null,
    pricingGroups: [
      {
        id: 'group-1',
        label: 'Nhóm 1',
        playerCount: 2,
        remainingCount: 2,
        hourlyRate: 50000,
        pricingRuleId: 'rule-1',
        pricingSnapshot: null,
      },
    ],
  } as unknown as SessionWithDetails
}

const pricing = {
  hourlyRate: 50000,
  totalHours: 2,
  subtotal: 100000,
  promotionDiscount: 0,
  grandTotal: 100000,
  isMemberSession: false,
  promotion: null,
}

function makeRepositories(overrides: Partial<Repositories> = {}): Repositories {
  const base: Repositories = {
    billing: {
      findVoidTarget: vi.fn(),
      findMergedDraftItems: vi.fn(),
      reverseStock: vi.fn(),
      markInvoiceCancelled: vi.fn(),
      createPaidInvoice: vi.fn(async () => ({ id: 'inv-1', invoiceNo: 'INV-1' })),
      createPayment: vi.fn(async () => ({ id: 'pay-1' })),
      createMembershipPayment: vi.fn(),
      createDraftInvoice: vi.fn(),
      createInvoiceItem: vi.fn(async () => ({ id: 'item-1' })),
      updateInvoiceTotals: vi.fn(),
      findDraftInvoices: vi.fn(),
      cancelDraftInvoices: vi.fn(),
      findByIdForEdit: vi.fn(),
      deleteInvoiceItems: vi.fn(),
      deletePayments: vi.fn(),
      updateInvoiceFinancials: vi.fn(),
    },
    audit: { append: vi.fn(async () => {}) },
    membership: { findLatest: vi.fn(), findActive: vi.fn(), create: vi.fn() },
    membershipPlan: { findById: vi.fn() },
    customer: { findById: vi.fn(), create: vi.fn(), addSpend: vi.fn(), recordPlay: vi.fn(), countWalkInsBetween: vi.fn() },
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
    },
    pricing: {
      findApplicableRule: vi.fn(),
      findByIdWithTiers: vi.fn(),
      getApplicableRules: vi.fn(),
      countApplicable: vi.fn(),
      countAll: vi.fn(),
      findOverlapping: vi.fn(),
    },
    promotions: { findAvailable: vi.fn(), findAvailableById: vi.fn(), findOverlapping: vi.fn() },
    settings: { get: vi.fn(), getNumeric: vi.fn(async () => 0), upsert: vi.fn() },
    session: {
      findByIdForCheckout: vi.fn(),
      findByIdWithCustomer: vi.fn(),
      findActiveByCustomer: vi.fn(),
      createWithRefs: vi.fn(),
      createPricingGroup: vi.fn(),
      update: vi.fn(async () => {}),
      decrementGroupRemaining: vi.fn(async () => ({ remainingCount: 0 })),
      sumRemainingPlayers: vi.fn(async () => 0),
    },
    product: {
      findManyByIds: vi.fn(),
      findByIdForSale: vi.fn(async () => ({
        id: 'prod-1',
        name: 'Nước suối',
        type: 'PRODUCT' as const,
        price: 15000,
        costPrice: 8000,
        stockQuantity: 10,
        isActive: true,
      })),
      decrementStockIfAvailable: vi.fn(async () => ({ count: 1 })),
      recordSaleMovement: vi.fn(async () => {}),
    },
  }
  return { ...base, ...overrides }
}

function makeCtx(): CheckoutContext {
  return {
    session: makeSession(),
    sessionId: 'session-1',
    staffId: 'staff-1',
    paymentMethod: 'CASH',
    endTime: new Date('2026-08-07T12:00:00Z'),
    notes: undefined,
    checkoutCount: 1,
    targetGroupId: 'group-1',
    pricing,
    checkoutLines: [
      { productId: 'prod-1', type: 'PRODUCT', description: 'Nước suối', quantity: 2, unitPrice: 15000, subtotal: 30000 },
    ],
    productSubtotal: 30000,
    draftInvoiceIds: [],
    newQuantityByProductId: new Map([['prod-1', 2]]),
    parkingVehicleCount: 0,
    checkoutAt: new Date('2026-08-07T12:00:00Z'),
    customerId: 'cust-1',
  }
}

function makeState(): CheckoutTxState {
  return {
    finalPricing: pricing,
    playDiscountTotal: 0,
    playTotal: 100000,
    invoiceSubtotal: 130000,
    invoiceGrandTotal: 130000,
    paidAt: new Date('2026-08-07T12:00:00Z'),
  }
}

async function expectTxError(repos: Repositories, code: string) {
  let caught: RollbackSignal | null = null
  try {
    await runCheckOutTx(repos, makeCtx(), makeState())
  } catch (error) {
    if (error instanceof RollbackSignal) caught = error
    else throw error
  }
  expect(caught?.error.code).toBe(code)
}

describe('runCheckOutTx', () => {
  it('trả SHIFT_REQUIRED khi chưa có ca mở', async () => {
    const repos = makeRepositories({
      shift: {
        ...makeRepositories().shift,
        findOpenForStaff: vi.fn(async () => null),
      },
    })
    await expectTxError(repos, 'SHIFT_REQUIRED')
    expect(repos.billing.createPaidInvoice).not.toHaveBeenCalled()
  })

  it('trả INSUFFICIENT_STOCK kèm tên sản phẩm khi trừ kho thất bại', async () => {
    const repos = makeRepositories({
      product: {
        ...makeRepositories().product,
        decrementStockIfAvailable: vi.fn(async () => ({ count: 0 })),
      },
    })
    let caught: RollbackSignal | null = null
    try {
      await runCheckOutTx(repos, makeCtx(), makeState())
    } catch (error) {
      if (error instanceof RollbackSignal) caught = error
      else throw error
    }
    expect(caught?.error.code).toBe('INSUFFICIENT_STOCK')
    expect(caught?.error.detail).toBe('Nước suối')
  })

  it('trả PROMOTION_UNAVAILABLE khi promotion không còn hiệu lực trong tx', async () => {
    const repos = makeRepositories({
      promotions: {
        ...makeRepositories().promotions,
        findAvailableById: vi.fn(async () => null),
      },
    })
    const state = makeState()
    state.promotionRuleId = 'promo-1'
    let caught: RollbackSignal | null = null
    try {
      await runCheckOutTx(repos, makeCtx(), state)
    } catch (error) {
      if (error instanceof RollbackSignal) caught = error
      else throw error
    }
    expect(caught?.error.code).toBe('PROMOTION_UNAVAILABLE')
  })

  it('checkout thành công: invoice + PLAY_TIME + payment + đóng phiên + audit', async () => {
    const repos = makeRepositories()
    const result = await runCheckOutTx(repos, makeCtx(), makeState())

    // Invoice PAID với tổng = playTotal (1 người) + sản phẩm
    expect(repos.billing.createPaidInvoice).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: 'cust-1',
        subtotal: 130000,
        discountTotal: 0,
        grandTotal: 130000,
      })
    )

    // PLAY_TIME item + PRODUCT item
    const items = (repos.billing.createInvoiceItem as ReturnType<typeof vi.fn>).mock.calls
    const playTimeCall = items.find((c) => c[0].type === 'PLAY_TIME')
    const productCall = items.find((c) => c[0].type === 'PRODUCT')
    expect(playTimeCall).toBeDefined()
    expect(playTimeCall![0]).toMatchObject({
      quantity: 2, // totalHours 2 × checkoutCount 1
      unitPrice: 50000,
      total: 100000,
      description: 'Giờ chơi (Nhóm 1: 1 người × 50kđ)',
    })
    expect(productCall![0]).toMatchObject({ productId: 'prod-1', quantity: 2, total: 30000 })

    // Trừ kho + ghi movement
    expect(repos.product.decrementStockIfAvailable).toHaveBeenCalledWith('prod-1', 2)
    expect(repos.product.recordSaleMovement).toHaveBeenCalledWith(
      expect.objectContaining({ productId: 'prod-1', quantity: 2 })
    )

    // Payment
    expect(repos.billing.createPayment).toHaveBeenCalledWith(
      expect.objectContaining({ invoiceId: 'inv-1', sessionId: 'session-1', grandTotal: 130000 })
    )

    // Group decrement + session COMPLETED (sumRemaining = 0)
    expect(repos.session.decrementGroupRemaining).toHaveBeenCalledWith('group-1', 1)
    expect(repos.session.update).toHaveBeenCalledWith(
      'session-1',
      expect.objectContaining({ status: 'COMPLETED', totalAmount: 130000 })
    )

    // Customer stats + audit
    expect(repos.customer.recordPlay).toHaveBeenCalledWith('cust-1', { hours: 2, spent: 130000 })
    expect(repos.audit.append).toHaveBeenCalledTimes(1)
    const auditCall = (repos.audit.append as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(auditCall.action).toBe('SESSION_CHECK_OUT')

    expect(result.remainingPlayers).toBe(0)
    expect(result.invoiceNo).toBe('INV-1')
  })

  it('không đóng phiên khi còn người chơi (partial checkout)', async () => {
    const repos = makeRepositories({
      session: {
        ...makeRepositories().session,
        decrementGroupRemaining: vi.fn(async () => ({ remainingCount: 1 })),
        sumRemainingPlayers: vi.fn(async () => 1),
      },
    })
    const result = await runCheckOutTx(repos, makeCtx(), makeState())
    expect(result.remainingPlayers).toBe(1)
    expect(repos.session.update).not.toHaveBeenCalled()
  })

  it('trừ phí gửi xe khi parkingVehicleCount > 0 và có đơn giá', async () => {
    const repos = makeRepositories({
      settings: {
        ...makeRepositories().settings,
        getNumeric: vi.fn(async () => 5000),
      },
    })
    const ctx = makeCtx()
    ctx.parkingVehicleCount = 2
    const result = await runCheckOutTx(repos, ctx, makeState())

    // SURCHARGE item + grandTotal bị trừ 10.000
    const items = (repos.billing.createInvoiceItem as ReturnType<typeof vi.fn>).mock.calls
    const surchargeCall = items.find((c) => c[0].type === 'SURCHARGE')
    expect(surchargeCall).toBeDefined()
    expect(surchargeCall![0]).toMatchObject({ quantity: 2, total: -10000 })
    expect(repos.billing.updateInvoiceTotals).toHaveBeenCalledWith('inv-1', 120000, 120000)
    expect(result.parkingFeeTotal).toBe(10000)
  })
})
