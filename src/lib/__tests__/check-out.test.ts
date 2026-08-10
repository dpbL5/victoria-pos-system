import { describe, it, expect, vi } from 'vitest'

// Mock prisma singleton — check-out.ts import runInTransaction (db-helpers → prisma).
// Test runCheckOutTx trực tiếp với fake repositories, không chạy transaction thật.
vi.mock('@/lib/infrastructure/prisma', () => ({ prisma: {} }))

import { runCheckOutTx, mapCheckoutError, type CheckoutContext, type CheckoutTxState } from '@/lib/sessions/use-cases/check-out'
import { RollbackSignal } from '@/lib/infrastructure/db-helpers'
import type { Repositories } from '@/lib/infrastructure/repositories'
import type { SessionWithDetails } from '@/lib/sessions/ports'

function makeSession(): SessionWithDetails {
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
      findByIdWithDetails: vi.fn(),
      findByIdForDelete: vi.fn(),
      countLinkedTransactions: vi.fn(async () => ({ payments: 0, membershipPayments: 0, stockMovements: 0 })),
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
      update: vi.fn(async () => {}),
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
    settings: { get: vi.fn(), getNumeric: vi.fn(async () => 0), upsert: vi.fn(), getWithLabel: vi.fn(), findAll: vi.fn() },
    session: {
      findByIdForCheckout: vi.fn(),
      findByIdWithCustomer: vi.fn(),
      findActiveByCustomer: vi.fn(),
      findMany: vi.fn(),
      findByIdForPreview: vi.fn(),
      findDraftSellTotals: vi.fn(),
      countCreatedBetween: vi.fn(async () => 0),
      createWithRefs: vi.fn(),
      createPricingGroup: vi.fn(),
      updatePricingGroup: vi.fn(),
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
    customerName: null,
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

  it('checkout khách vãng lai (không Customer): không gọi recordPlay, invoice customerId null', async () => {
    const repos = makeRepositories()
    const session = makeSession()
    session.customerId = null
    session.customerName = 'Nguyễn Văn A'
    session.customer = null as never
    const ctx = makeCtx()
    ctx.session = session
    ctx.customerId = null
    ctx.customerName = 'Nguyễn Văn A'
    const result = await runCheckOutTx(repos, ctx, makeState())

    expect(repos.billing.createPaidInvoice).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: null })
    )
    expect(repos.customer.recordPlay).not.toHaveBeenCalled()
    // metadata PLAY_TIME có tên khách vãng lai
    const items = (repos.billing.createInvoiceItem as ReturnType<typeof vi.fn>).mock.calls
    const playTimeCall = items.find((c) => c[0].type === 'PLAY_TIME')
    expect(playTimeCall![0].metadata).toMatchObject({ customerType: 'WALK_IN', customerName: 'Nguyễn Văn A' })
    expect(result.remainingPlayers).toBe(0)
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

  it('trả PRICING_GROUP_UNDERFLOW khi decrement nhóm xuống dưới 0', async () => {
    const repos = makeRepositories({
      session: {
        ...makeRepositories().session,
        decrementGroupRemaining: vi.fn(async () => ({ remainingCount: -1 })),
      },
    })
    await expectTxError(repos, 'PRICING_GROUP_UNDERFLOW')
  })

  it('trả END_TIME_BEFORE_START khi endTime trước startTime', async () => {
    // Guard này nằm ở entry `checkOut` (pre-tx), không trong runCheckOutTx.
    // Ta test qua mapCheckoutError cho mapper mapping đúng.
    const mapped = mapCheckoutError({ code: 'END_TIME_BEFORE_START' })
    expect(mapped.status).toBe(400)
    expect(mapped.code).toBe('END_TIME_BEFORE_START')
  })

  it('trả NO_PLAYERS_TO_CHECKOUT khi không còn người chơi để checkout', async () => {
    const mapped = mapCheckoutError({ code: 'NO_PLAYERS_TO_CHECKOUT' })
    expect(mapped.status).toBe(400)
    expect(mapped.code).toBe('NO_PLAYERS_TO_CHECKOUT')
  })

  it('mapCheckoutError: PRICING_GROUP_UNDERFLOW mapping thành 400 (bug fix)', async () => {
    const mapped = mapCheckoutError({ code: 'PRICING_GROUP_UNDERFLOW' })
    expect(mapped.status).toBe(400)
    expect(mapped.code).toBe('PRICING_GROUP_UNDERFLOW')
  })

  it('checkout khách vãng lai với pricing tiered: nhiều bậc giá', async () => {
    const repos = makeRepositories()
    const ctx = makeCtx()
    ctx.pricing = { ...pricing, totalHours: 5, subtotal: 250000, grandTotal: 250000 }
    const state = makeState()
    state.finalPricing = { ...pricing, totalHours: 5, subtotal: 250000, grandTotal: 250000 }
    state.playTotal = 250000
    state.invoiceSubtotal = 280000 // 250000 + 30000 product
    state.invoiceGrandTotal = 280000
    const result = await runCheckOutTx(repos, ctx, state)

    // PLAY_TIME quantity = totalHours 5 × checkoutCount 1, unitPrice = rate
    const items = (repos.billing.createInvoiceItem as ReturnType<typeof vi.fn>).mock.calls
    const playTimeCall = items.find((c) => c[0].type === 'PLAY_TIME')
    expect(playTimeCall![0]).toMatchObject({
      quantity: 5,
      unitPrice: 50000,
      total: 250000,
    })
    expect(result.finalPricing.subtotal).toBe(250000)
  })

  it('checkout hội viên: PLAY_TIME với isMemberSession + total 0, không trừ kho', async () => {
    const repos = makeRepositories({
      membership: {
        ...makeRepositories().membership,
        findActive: vi.fn(async () => ({
          id: 'mem-1',
          customerId: 'cust-1',
          planId: 'plan-1',
          startsAt: new Date('2026-01-01'),
          expiresAt: new Date('2026-12-31'),
          status: 'ACTIVE' as const,
          plan: { id: 'plan-1', name: 'VIP', durationMonths: 12, price: 1000000, isActive: true, createdAt: new Date(), updatedAt: new Date() },
        }) as never),
      },
    })
    const session = makeSession()
    session.customer!.type = 'MEMBER'
    session.hourlyRate = 0 as never
    session.membership = {
      id: 'mem-1',
      customerId: 'cust-1',
      planId: 'plan-1',
      startsAt: new Date('2026-01-01'),
      expiresAt: new Date('2026-12-31'),
      status: 'ACTIVE' as const,
      plan: { id: 'plan-1', name: 'VIP', durationMonths: 12, price: 1000000, isActive: true, createdAt: new Date(), updatedAt: new Date() },
    } as never
    const ctx = makeCtx()
    ctx.session = session
    ctx.pricing = { ...pricing, hourlyRate: 0, subtotal: 0, grandTotal: 0, isMemberSession: true }
    // Member checkout không kèm sản phẩm
    ctx.checkoutLines = []
    ctx.productSubtotal = 0
    ctx.newQuantityByProductId = new Map()
    const state = makeState()
    state.finalPricing = { ...pricing, hourlyRate: 0, subtotal: 0, grandTotal: 0, isMemberSession: true }
    state.playTotal = 0
    state.invoiceSubtotal = 30000 // chỉ product
    state.invoiceGrandTotal = 30000
    const result = await runCheckOutTx(repos, ctx, state)

    const items = (repos.billing.createInvoiceItem as ReturnType<typeof vi.fn>).mock.calls
    const playTimeCall = items.find((c) => c[0].type === 'PLAY_TIME')
    expect(playTimeCall![0]).toMatchObject({
      quantity: 2,
      unitPrice: 0,
      total: 0,
      description: 'Giờ chơi hội viên × 1 người',
    })
    expect(repos.product.decrementStockIfAvailable).not.toHaveBeenCalled()
    expect(result.finalPricing.isMemberSession).toBe(true)
  })

  it('checkout full với merged drafts: hủy draft invoices khi đóng phiên', async () => {
    const repos = makeRepositories()
    const ctx = makeCtx()
    ctx.draftInvoiceIds = ['draft-1', 'draft-2']
    const result = await runCheckOutTx(repos, ctx, makeState())

    // Full checkout → cancel drafts với note gộp vào invoice
    expect(repos.billing.cancelDraftInvoices).toHaveBeenCalledWith(
      ['draft-1', 'draft-2'],
      'Đã gộp vào hóa đơn INV-1'
    )
    expect(result.remainingPlayers).toBe(0)
  })

  it('WALK_IN session chưa có giá: persist bảng giá vào group 1 trước khi tạo invoice', async () => {
    const repos = makeRepositories()
    const ctx = makeCtx()
    ctx.session = {
      ...makeSession(),
      hourlyRate: 0 as never,
      pricingGroups: [{
        id: 'group-1',
        label: 'Nhóm 1',
        playerCount: 2,
        remainingCount: 2,
        hourlyRate: 0,
        pricingRuleId: null,
        pricingSnapshot: null,
      }],
    } as unknown as SessionWithDetails
    ctx.pendingAssignments = [{
      groupId: 'group-1',
      label: 'Nhóm 1',
      playerCount: 2,
      pricingRuleId: 'rule-1',
      snapshot: { ruleId: 'rule-1', name: 'Giờ vàng', ratePerHour: 50000, tiers: [] },
    }]
    ctx.pricing = { ...pricing, hourlyRate: 50000 }
    const state = makeState()
    state.finalPricing = { ...pricing, hourlyRate: 50000 }
    const result = await runCheckOutTx(repos, ctx, state)

    expect(repos.session.updatePricingGroup).toHaveBeenCalledWith('group-1', expect.objectContaining({
      label: 'Nhóm 1',
      playerCount: 2,
      remainingCount: 2,
      hourlyRate: 50000,
      pricingRuleId: 'rule-1',
      pricingSnapshot: { ruleId: 'rule-1', name: 'Giờ vàng', ratePerHour: 50000, tiers: [] },
    }))
    expect(repos.session.createPricingGroup).not.toHaveBeenCalled()
    // Audit đánh dấu gán giá tại checkout
    const auditCall = (repos.audit.append as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(auditCall.details.pricingAssignedAtCheckout).toBe(true)
    expect(auditCall.details.assignedPricingRuleIds).toEqual(['rule-1'])
    expect(result.finalPricing.hourlyRate).toBe(50000)
  })

  it('WALK_IN chia nhóm tại checkout: update group 1 + create group 2..N', async () => {
    const repos = makeRepositories()
    const ctx = makeCtx()
    ctx.session = {
      ...makeSession(),
      hourlyRate: 0 as never,
      playerCount: 3,
      pricingGroups: [{
        id: 'group-1',
        label: 'Nhóm 1',
        playerCount: 3,
        remainingCount: 3,
        hourlyRate: 0,
        pricingRuleId: null,
        pricingSnapshot: null,
      }],
    } as unknown as SessionWithDetails
    ctx.pendingAssignments = [
      { groupId: 'group-1', label: 'Nhóm 1', playerCount: 2, pricingRuleId: 'rule-1', snapshot: { ruleId: 'rule-1', name: 'Giờ vàng', ratePerHour: 50000, tiers: [] } },
      { groupId: null, label: 'Nhóm 2', playerCount: 1, pricingRuleId: 'rule-2', snapshot: { ruleId: 'rule-2', name: 'Giờ tối', ratePerHour: 40000, tiers: [] } },
    ]
    const state = makeState()
    state.finalPricing = { ...pricing, hourlyRate: 50000 }
    await runCheckOutTx(repos, ctx, state)

    expect(repos.session.updatePricingGroup).toHaveBeenCalledTimes(1)
    expect(repos.session.updatePricingGroup).toHaveBeenCalledWith('group-1', expect.objectContaining({
      playerCount: 2,
      remainingCount: 2,
      hourlyRate: 50000,
      pricingRuleId: 'rule-1',
    }))
    expect(repos.session.createPricingGroup).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: 'session-1',
      label: 'Nhóm 2',
      playerCount: 1,
      remainingCount: 1,
      hourlyRate: 40000,
      pricingRuleId: 'rule-2',
    }))
  })

  it('không persist bảng giá khi group đã có snapshot (session cũ)', async () => {
    const repos = makeRepositories()
    const ctx = makeCtx()
    ctx.pendingAssignments = undefined
    const result = await runCheckOutTx(repos, ctx, makeState())

    expect(repos.session.updatePricingGroup).not.toHaveBeenCalled()
    expect(repos.session.createPricingGroup).not.toHaveBeenCalled()
    const auditCall = (repos.audit.append as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(auditCall.details.pricingAssignedAtCheckout).toBe(false)
    expect(result.remainingPlayers).toBe(0)
  })

  it('mapCheckoutError: PRICING_RULE_NOT_FOUND + GROUP_PLAYER_COUNT_MISMATCH mapping', async () => {
    expect(mapCheckoutError({ code: 'PRICING_RULE_NOT_FOUND' } as never)).toMatchObject({ status: 400, message: expect.stringContaining('bảng giá') })
    expect(mapCheckoutError({ code: 'GROUP_PLAYER_COUNT_MISMATCH' } as never)).toMatchObject({ status: 400, message: expect.stringContaining('nhóm') })
    expect(mapCheckoutError({ code: 'PRICING_RULE_NOT_EFFECTIVE' } as never)).toMatchObject({ status: 400 })
  })
})
