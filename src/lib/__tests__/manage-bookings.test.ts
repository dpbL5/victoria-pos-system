import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/infrastructure/prisma', () => ({ prisma: {} }))

import { setBookingStatus } from '@/lib/bookings/use-cases/manage-bookings'
import type { Repositories } from '@/lib/infrastructure/repositories'

// Container cho fake repos — mock factory đọc qua getter để tránh hoisting
const state = vi.hoisted(() => ({
  reposForTest: null as Repositories | null,
}))

vi.mock('@/lib/infrastructure/db-helpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/infrastructure/db-helpers')>()
  return {
    ...actual,
    runInTransaction: vi.fn(async (work: (repos: Repositories) => Promise<unknown>) => {
      try {
        const value = await work(state.reposForTest!)
        return { ok: true, value } as const
      } catch (e) {
        if (e instanceof actual.RollbackSignal) {
          return { ok: false, error: (e as { error: { code: string; detail?: string } }).error } as const
        }
        throw e
      }
    }),
  }
})

const PAST = new Date('2020-01-01T02:00:00.000Z')
const FUTURE = new Date('2099-01-01T02:00:00.000Z')

function makeBooking(overrides: Record<string, unknown> = {}) {
  return {
    id: 'booking-1',
    customerId: null,
    status: 'BOOKED',
    scheduledAt: PAST,
    depositAmount: 0,
    depositAppliedAmount: 0,
    depositRefundedAmount: 0,
    depositPaymentMethod: 'CASH',
    ...overrides,
  }
}

function makeRepos(
  booking: ReturnType<typeof makeBooking> | null,
  options: { transitionCount?: number; shiftId?: string | null } = {}
) {
  const transition = vi.fn(async () => ({ count: options.transitionCount ?? 1 }))
  const append = vi.fn(async () => ({}))
  const createPaidInvoice = vi.fn(async () => ({ id: 'dep-inv-1', invoiceNo: 'DEP-20260101-0001' }))
  const createPayment = vi.fn(async () => ({ id: 'dep-pay-1' }))
  const setDepositInvoice = vi.fn(async () => ({}))
  const findOpenIdForStaff = vi.fn(async () => (options.shiftId === null ? null : { id: options.shiftId ?? 'shift-1' }))
  const repos = {
    booking: {
      findById: vi.fn(async () => booking),
      transition,
      setDepositInvoice,
    },
    billing: { createPaidInvoice, createPayment },
    shift: { findOpenIdForStaff },
    audit: { append },
  } as unknown as Repositories
  state.reposForTest = repos
  return { repos, transition, append, createPaidInvoice, createPayment, setDepositInvoice, findOpenIdForStaff }
}

const INPUT = { bookingId: 'booking-1', staffId: 'staff-1', status: 'CANCELLED' as const }

describe('setBookingStatus — hủy lịch quá giờ hẹn còn cọc', () => {
  it('không tìm thấy lịch → BOOKING_NOT_FOUND', async () => {
    const { repos } = makeRepos(null)
    const result = await setBookingStatus(INPUT, repos)
    expect(result).toEqual({ ok: false, error: { code: 'BOOKING_NOT_FOUND' } })
  })

  it('còn cọc mà CHƯA quá giờ → BOOKING_HAS_DEPOSIT, không đụng DB', async () => {
    const { repos, transition, createPaidInvoice } = makeRepos(makeBooking({ depositAmount: 100000, scheduledAt: FUTURE }))
    const result = await setBookingStatus(INPUT, repos)
    expect(result).toEqual({ ok: false, error: { code: 'BOOKING_HAS_DEPOSIT' } })
    expect(transition).not.toHaveBeenCalled()
    expect(createPaidInvoice).not.toHaveBeenCalled()
  })

  it('quá giờ + còn cọc + có ca → giữ cọc: hoá đơn DEP + payment + link booking + audit, rồi huỷ', async () => {
    const { repos, transition, append, createPaidInvoice, createPayment, setDepositInvoice } = makeRepos(
      makeBooking({ depositAmount: 100000 })
    )
    const result = await setBookingStatus(INPUT, repos)
    expect(result).toEqual({ ok: true, value: { id: 'booking-1', status: 'CANCELLED' } })
    expect(createPaidInvoice).toHaveBeenCalledWith(expect.objectContaining({
      shiftId: 'shift-1',
      staffId: 'staff-1',
      customerId: null,
      subtotal: 100000,
      grandTotal: 100000,
      lines: [expect.objectContaining({ type: 'DEPOSIT', total: 100000 })],
    }))
    expect(createPayment).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'DEPOSIT',
      invoiceId: 'dep-inv-1',
      shiftId: 'shift-1',
      grandTotal: 100000,
      paymentMethod: 'CASH',
    }))
    expect(setDepositInvoice).toHaveBeenCalledWith('booking-1', 'dep-inv-1')
    expect(transition).toHaveBeenCalledWith('booking-1', 'BOOKED', 'CANCELLED', true)
    expect(append).toHaveBeenCalledWith(expect.objectContaining({
      action: 'BOOKING_DEPOSIT_FORFEIT',
      entityId: 'booking-1',
      details: { invoiceId: 'dep-inv-1', amount: 100000, paymentMethod: 'CASH' },
    }))
    expect(append).toHaveBeenCalledWith(expect.objectContaining({ action: 'BOOKING_CANCELLED', details: {} }))
  })

  it('quá giờ + còn cọc nhưng CHƯA có ca → SHIFT_REQUIRED, không tạo hoá đơn, không huỷ', async () => {
    const { repos, transition, createPaidInvoice } = makeRepos(makeBooking({ depositAmount: 100000 }), { shiftId: null })
    const result = await setBookingStatus(INPUT, repos)
    expect(result).toEqual({ ok: false, error: { code: 'SHIFT_REQUIRED' } })
    expect(createPaidInvoice).not.toHaveBeenCalled()
    expect(transition).not.toHaveBeenCalled()
  })

  it('không cọc → huỷ bình thường, guard cọc giữ nguyên, không gọi ca/hoá đơn', async () => {
    const { repos, transition, append, createPaidInvoice, findOpenIdForStaff } = makeRepos(makeBooking())
    const result = await setBookingStatus(INPUT, repos)
    expect(result).toEqual({ ok: true, value: { id: 'booking-1', status: 'CANCELLED' } })
    expect(transition).toHaveBeenCalledWith('booking-1', 'BOOKED', 'CANCELLED', false)
    expect(append).toHaveBeenCalledWith(expect.objectContaining({ details: {} }))
    expect(createPaidInvoice).not.toHaveBeenCalled()
    expect(findOpenIdForStaff).not.toHaveBeenCalled()
  })

  it('transition không khớp hàng nào → BOOKING_NOT_EDITABLE', async () => {
    const { repos } = makeRepos(makeBooking(), { transitionCount: 0 })
    const result = await setBookingStatus(INPUT, repos)
    expect(result).toEqual({ ok: false, error: { code: 'BOOKING_NOT_EDITABLE' } })
  })
})
