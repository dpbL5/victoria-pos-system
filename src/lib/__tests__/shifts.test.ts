import { describe, it, expect, vi } from 'vitest'
import {
  calculateExpectedCash,
  getShiftRevenueData,
  getShiftTransactions,
} from '@/lib/business/shifts'

// ── Helpers ─────────────────────────────────────────────

/** Db mock cho getShiftRevenueData / getShiftTransactions (interface ShiftDb) */
function createShiftDb() {
  return {
    payment: {
      findMany: vi.fn(),
      groupBy: vi.fn(),
    },
    membershipPayment: {
      findMany: vi.fn(),
      groupBy: vi.fn(),
    },
  }
}

type ShiftStore = Parameters<typeof calculateExpectedCash>[0]

/** Db mock cho calculateExpectedCash (Pick<TransactionClient, 'shift' | 'payment'>) */
function createShiftStore() {
  const shift = { findUnique: vi.fn() }
  const payment = { aggregate: vi.fn() }
  return {
    db: { shift, payment } as unknown as ShiftStore,
    shift,
    payment,
  }
}

function makePayment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pay-1',
    grandTotal: 120_000,
    paymentMethod: 'MEMBER',
    paidAt: new Date('2026-08-06T10:00:00Z'),
    invoice: {
      id: 'inv-1',
      invoiceNo: 'HD-001',
      customer: { fullName: 'Nguyễn Văn A', type: 'MEMBER' },
    },
    session: null,
    staff: { fullName: 'Thu ngân A' },
    ...overrides,
  }
}

function makeMembershipPayment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'mp-1',
    amount: 300_000,
    paymentMethod: 'CASH',
    paidAt: new Date('2026-08-06T09:00:00Z'),
    customer: { fullName: 'Nguyễn Văn A', type: 'MEMBER' },
    plan: { name: 'Gói VIP' },
    staff: { fullName: 'Thu ngân A' },
    ...overrides,
  }
}

// ── getShiftTransactions ────────────────────────────────

describe('getShiftTransactions', () => {
  it('memberAmount chỉ gồm giao dịch paymentMethod = MEMBER', async () => {
    const db = createShiftDb()
    db.payment.findMany.mockResolvedValue([
      makePayment({ id: 'p1', paymentMethod: 'CASH', grandTotal: 80_000 }),
      makePayment({ id: 'p2', paymentMethod: 'MEMBER', grandTotal: 120_000 }),
    ])
    db.membershipPayment.findMany.mockResolvedValue([])

    const { transactions, summary } = await getShiftTransactions(db, 'shift-1')

    expect(summary.memberAmount).toBe(120_000)
    expect(summary.cashAmount).toBe(80_000)
    expect(summary.transferAmount).toBe(0)
    expect(summary.cardAmount).toBe(0)
    expect(summary.totalAmount).toBe(200_000)
    expect(summary.totalCount).toBe(2)
    expect(summary.paymentCount).toBe(2)
    expect(summary.membershipCount).toBe(0)
    expect(transactions).toHaveLength(2)
  })

  it('memberAmount gộp cả membershipPayment thanh toán MEMBER', async () => {
    const db = createShiftDb()
    db.payment.findMany.mockResolvedValue([])
    db.membershipPayment.findMany.mockResolvedValue([
      makeMembershipPayment({ id: 'mp1', paymentMethod: 'MEMBER', amount: 300_000 }),
    ])

    const { summary } = await getShiftTransactions(db, 'shift-1')

    expect(summary.memberAmount).toBe(300_000)
    expect(summary.cashAmount).toBe(0)
    expect(summary.totalAmount).toBe(300_000)
    expect(summary.membershipCount).toBe(1)
  })

  it('sắp xếp transactions theo paidAt tăng dần (gộp payment + membership)', async () => {
    const db = createShiftDb()
    db.payment.findMany.mockResolvedValue([
      makePayment({ id: 'p-late', paidAt: new Date('2026-08-06T10:00:00Z') }),
    ])
    db.membershipPayment.findMany.mockResolvedValue([
      makeMembershipPayment({ id: 'mp-early', paidAt: new Date('2026-08-06T09:00:00Z') }),
    ])

    const { transactions } = await getShiftTransactions(db, 'shift-1')

    expect(transactions.map((t) => t.id)).toEqual(['mp-early', 'p-late'])
    expect(transactions[0].type).toBe('membership')
    expect(transactions[0].planName).toBe('Gói VIP')
    expect(transactions[0].paidAt).toBe('2026-08-06T09:00:00.000Z')
    expect(transactions[1].type).toBe('payment')
    expect(transactions[1].invoiceNo).toBe('HD-001')
  })

  it('customerName fallback: invoice → session → "Khách lẻ"', async () => {
    const db = createShiftDb()
    db.payment.findMany.mockResolvedValue([
      makePayment({
        id: 'p1',
        invoice: null,
        session: { customer: { fullName: 'Khách qua session', type: 'WALK_IN' } },
      }),
      makePayment({ id: 'p2', invoice: null, session: null }),
    ])
    db.membershipPayment.findMany.mockResolvedValue([])

    const { transactions } = await getShiftTransactions(db, 'shift-1')

    expect(transactions[0].customerName).toBe('Khách qua session')
    expect(transactions[0].customerType).toBe('WALK_IN')
    expect(transactions[1].customerName).toBe('Khách lẻ')
    expect(transactions[1].customerType).toBeNull()
  })
})

// ── getShiftRevenueData ─────────────────────────────────

describe('getShiftRevenueData', () => {
  const paymentRow = (paymentMethod: string, grandTotal: number | null) => ({
    paymentMethod,
    _sum: { grandTotal },
    _count: { _all: 1 },
  })

  it('chia doanh thu theo từng phương thức, MEMBER nằm riêng', async () => {
    const db = createShiftDb()
    db.payment.groupBy.mockResolvedValue([
      paymentRow('CASH', 100_000),
      paymentRow('TRANSFER', 200_000),
      paymentRow('CARD', 150_000),
      paymentRow('MEMBER', 250_000),
    ])
    db.membershipPayment.groupBy.mockResolvedValue([])

    const rev = await getShiftRevenueData(db, 'shift-1')

    expect(rev.cashRevenue).toBe(100_000)
    expect(rev.transferRevenue).toBe(200_000)
    expect(rev.cardRevenue).toBe(150_000)
    expect(rev.memberRevenue).toBe(250_000)
    expect(rev.totalRevenue).toBe(700_000)
    expect(rev.paymentCount).toBe(4)
    expect(rev.membershipCount).toBe(0)
  })

  it('MEMBER không nằm trong cash/transfer/card nhưng có trong tổng doanh thu', async () => {
    const db = createShiftDb()
    db.payment.groupBy.mockResolvedValue([paymentRow('MEMBER', 250_000)])
    db.membershipPayment.groupBy.mockResolvedValue([])

    const rev = await getShiftRevenueData(db, 'shift-1')

    expect(rev.memberRevenue).toBe(250_000)
    expect(rev.cashRevenue).toBe(0)
    expect(rev.transferRevenue).toBe(0)
    expect(rev.cardRevenue).toBe(0)
    expect(rev.totalRevenue).toBe(250_000)
  })

  it('gộp doanh thu membershipPayment theo phương thức', async () => {
    const db = createShiftDb()
    db.payment.groupBy.mockResolvedValue([])
    db.membershipPayment.groupBy.mockResolvedValue([
      { paymentMethod: 'CASH', _sum: { amount: 300_000 }, _count: { _all: 1 } },
      { paymentMethod: 'MEMBER', _sum: { amount: 300_000 }, _count: { _all: 1 } },
    ])

    const rev = await getShiftRevenueData(db, 'shift-1')

    expect(rev.cashRevenue).toBe(300_000)
    expect(rev.memberRevenue).toBe(300_000)
    expect(rev.totalRevenue).toBe(600_000)
    expect(rev.membershipCount).toBe(2)
  })

  it('không có dữ liệu → tất cả về 0', async () => {
    const db = createShiftDb()
    db.payment.groupBy.mockResolvedValue([])
    db.membershipPayment.groupBy.mockResolvedValue([])

    const rev = await getShiftRevenueData(db, 'shift-1')

    expect(rev).toEqual({
      totalRevenue: 0,
      cashRevenue: 0,
      transferRevenue: 0,
      cardRevenue: 0,
      memberRevenue: 0,
      paymentCount: 0,
      membershipCount: 0,
    })
  })

  it('row _sum = null vẫn đếm giao dịch nhưng không cộng doanh thu', async () => {
    const db = createShiftDb()
    db.payment.groupBy.mockResolvedValue([paymentRow('CASH', null)])
    db.membershipPayment.groupBy.mockResolvedValue([])

    const rev = await getShiftRevenueData(db, 'shift-1')

    expect(rev.cashRevenue).toBe(0)
    expect(rev.totalRevenue).toBe(0)
    expect(rev.paymentCount).toBe(1)
  })
})

// ── calculateExpectedCash ───────────────────────────────

describe('calculateExpectedCash', () => {
  it('throw SHIFT_NOT_FOUND khi ca không tồn tại', async () => {
    const { db, shift } = createShiftStore()
    shift.findUnique.mockResolvedValue(null)

    await expect(calculateExpectedCash(db, 'shift-1')).rejects.toThrow(
      'SHIFT_NOT_FOUND'
    )
  })

  it('tiền mặt dự kiến = openingCash + tổng payment CASH', async () => {
    const { db, shift, payment } = createShiftStore()
    shift.findUnique.mockResolvedValue({ openingCash: 200_000 })
    payment.aggregate.mockResolvedValue({ _sum: { grandTotal: 500_000 } })

    await expect(calculateExpectedCash(db, 'shift-1')).resolves.toBe(700_000)
  })

  it('payment MEMBER không thu tiền mặt → không vào tiền mặt dự kiến', async () => {
    const { db, shift, payment } = createShiftStore()
    shift.findUnique.mockResolvedValue({ openingCash: 200_000 })
    payment.aggregate.mockResolvedValue({ _sum: { grandTotal: null } })

    await expect(calculateExpectedCash(db, 'shift-1')).resolves.toBe(200_000)
  })

  it('không có payment cash → tiền mặt dự kiến chỉ là openingCash', async () => {
    const { db, shift, payment } = createShiftStore()
    shift.findUnique.mockResolvedValue({ openingCash: 0 })
    payment.aggregate.mockResolvedValue({ _sum: { grandTotal: null } })

    await expect(calculateExpectedCash(db, 'shift-1')).resolves.toBe(0)
  })
})
