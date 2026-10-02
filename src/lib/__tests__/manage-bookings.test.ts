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
    status: 'BOOKED',
    scheduledAt: PAST,
    depositAmount: 0,
    depositAppliedAmount: 0,
    depositRefundedAmount: 0,
    depositPaymentMethod: 'CASH',
    ...overrides,
  }
}

function makeRepos(booking: ReturnType<typeof makeBooking> | null, transitionCount = 1) {
  const transition = vi.fn(async () => ({ count: transitionCount }))
  const append = vi.fn(async () => ({}))
  const repos = {
    booking: {
      findById: vi.fn(async () => booking),
      transition,
    },
    audit: { append },
  } as unknown as Repositories
  state.reposForTest = repos
  return { repos, transition, append }
}

const INPUT = { bookingId: 'booking-1', staffId: 'staff-1', status: 'CANCELLED' as const }

describe('setBookingStatus — hủy lịch quá giờ hẹn còn cọc', () => {
  it('không tìm thấy lịch → BOOKING_NOT_FOUND', async () => {
    const { repos } = makeRepos(null)
    const result = await setBookingStatus(INPUT, repos)
    expect(result).toEqual({ ok: false, error: { code: 'BOOKING_NOT_FOUND' } })
  })

  it('còn cọc mà không xác nhận đã hoàn → BOOKING_HAS_DEPOSIT, không đụng DB', async () => {
    const { repos, transition } = makeRepos(makeBooking({ depositAmount: 100000 }))
    const result = await setBookingStatus(INPUT, repos)
    expect(result).toEqual({ ok: false, error: { code: 'BOOKING_HAS_DEPOSIT' } })
    expect(transition).not.toHaveBeenCalled()
  })

  it('còn cọc + xác nhận hoàn nhưng CHƯA quá giờ → vẫn BOOKING_HAS_DEPOSIT', async () => {
    const { repos, transition } = makeRepos(makeBooking({ depositAmount: 100000, scheduledAt: FUTURE }))
    const result = await setBookingStatus({ ...INPUT, depositRefunded: true }, repos)
    expect(result).toEqual({ ok: false, error: { code: 'BOOKING_HAS_DEPOSIT' } })
    expect(transition).not.toHaveBeenCalled()
  })

  it('quá giờ + còn cọc + xác nhận đã hoàn → hủy, transition mở guard cọc, audit ghi số tiền đã hoàn ngoài', async () => {
    const { repos, transition, append } = makeRepos(makeBooking({ depositAmount: 100000 }))
    const result = await setBookingStatus({ ...INPUT, depositRefunded: true }, repos)
    expect(result).toEqual({ ok: true, value: { id: 'booking-1', status: 'CANCELLED' } })
    expect(transition).toHaveBeenCalledWith('booking-1', 'BOOKED', 'CANCELLED', true)
    expect(append).toHaveBeenCalledWith(expect.objectContaining({
      action: 'BOOKING_CANCELLED',
      details: { depositRefundedExternally: 100000, depositPaymentMethod: 'CASH' },
    }))
  })

  it('không cọc → hủy bình thường, guard cọc giữ nguyên', async () => {
    const { repos, transition, append } = makeRepos(makeBooking())
    const result = await setBookingStatus(INPUT, repos)
    expect(result).toEqual({ ok: true, value: { id: 'booking-1', status: 'CANCELLED' } })
    expect(transition).toHaveBeenCalledWith('booking-1', 'BOOKED', 'CANCELLED', false)
    expect(append).toHaveBeenCalledWith(expect.objectContaining({ details: {} }))
  })

  it('transition không khớp hàng nào → BOOKING_NOT_EDITABLE', async () => {
    const { repos } = makeRepos(makeBooking(), 0)
    const result = await setBookingStatus(INPUT, repos)
    expect(result).toEqual({ ok: false, error: { code: 'BOOKING_NOT_EDITABLE' } })
  })
})
