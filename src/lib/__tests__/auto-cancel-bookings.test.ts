import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/infrastructure/prisma', () => ({ prisma: {} }))

import { autoCancelStaleBookings } from '@/lib/bookings/use-cases/manage-bookings'
import type { Repositories } from '@/lib/infrastructure/repositories'

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

// 10:00 ngày 02/10/2026 giờ VN → mốc 00:00 hôm nay theo VN là 01/10/2026 17:00 UTC
const NOW = new Date('2026-10-02T03:00:00.000Z')
const CUTOFF = new Date('2026-10-01T17:00:00.000Z')

function makeBooking(overrides: Record<string, unknown> = {}) {
  return {
    id: 'booking-1',
    status: 'BOOKED',
    scheduledAt: new Date('2026-10-01T02:00:00.000Z'),
    depositAmount: 0,
    depositAppliedAmount: 0,
    depositRefundedAmount: 0,
    ...overrides,
  }
}

type BookingFixture = ReturnType<typeof makeBooking>

function makeRepos(bookings: BookingFixture[], transitionCount = 1) {
  const findMany = vi.fn(async () => bookings)
  const transition = vi.fn(async () => ({ count: transitionCount }))
  const append = vi.fn(async () => ({}))
  const repos = {
    booking: { findMany, transition },
    audit: { append },
  } as unknown as Repositories
  state.reposForTest = repos
  return { repos, findMany, transition, append }
}

const INPUT = { actorId: 'staff-1', now: NOW }

describe('autoCancelStaleBookings — tự huỷ lịch quá ngày', () => {
  it('quét lịch BOOKED có giờ hẹn trước 00:00 hôm nay theo giờ VN', async () => {
    const { repos, findMany } = makeRepos([])
    const result = await autoCancelStaleBookings(INPUT, repos)
    expect(result).toEqual({ ok: true, value: { cancelled: 0 } })
    expect(findMany).toHaveBeenCalledWith({ from: new Date(0), to: CUTOFF, statuses: ['BOOKED'] })
  })

  it('không có lịch quá ngày → không đụng DB ghi', async () => {
    const { repos, transition, append } = makeRepos([])
    const result = await autoCancelStaleBookings(INPUT, repos)
    expect(result).toEqual({ ok: true, value: { cancelled: 0 } })
    expect(transition).not.toHaveBeenCalled()
    expect(append).not.toHaveBeenCalled()
  })

  it('huỷ lịch không cọc và ghi audit có dấu tự động', async () => {
    const { repos, transition, append } = makeRepos([makeBooking()])
    const result = await autoCancelStaleBookings(INPUT, repos)
    expect(result).toEqual({ ok: true, value: { cancelled: 1 } })
    expect(transition).toHaveBeenCalledWith('booking-1', 'BOOKED', 'CANCELLED')
    expect(append).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'staff-1',
      action: 'BOOKING_CANCELLED',
      entityId: 'booking-1',
      details: { autoCancelled: true, scheduledAt: '2026-10-01T02:00:00.000Z' },
    }))
  })

  it('giữ nguyên lịch còn cọc chưa xử lý', async () => {
    const { repos, transition, append } = makeRepos([makeBooking({ id: 'booking-coc', depositAmount: 100000 })])
    const result = await autoCancelStaleBookings(INPUT, repos)
    expect(result).toEqual({ ok: true, value: { cancelled: 0 } })
    expect(transition).not.toHaveBeenCalled()
    expect(append).not.toHaveBeenCalled()
  })

  it('chỉ huỷ lịch không cọc trong danh sách lẫn lộn', async () => {
    const { repos, transition } = makeRepos([
      makeBooking({ id: 'free-1' }),
      makeBooking({ id: 'coc-1', depositAmount: 50000 }),
      makeBooking({ id: 'free-2' }),
    ])
    const result = await autoCancelStaleBookings(INPUT, repos)
    expect(result).toEqual({ ok: true, value: { cancelled: 2 } })
    expect(transition).toHaveBeenCalledTimes(2)
    expect(transition).toHaveBeenCalledWith('free-1', 'BOOKED', 'CANCELLED')
    expect(transition).toHaveBeenCalledWith('free-2', 'BOOKED', 'CANCELLED')
  })

  it('bỏ qua lịch đã bị đổi trạng thái song song (transition khớp 0 hàng)', async () => {
    const { repos, append } = makeRepos([makeBooking()], 0)
    const result = await autoCancelStaleBookings(INPUT, repos)
    expect(result).toEqual({ ok: true, value: { cancelled: 0 } })
    expect(append).not.toHaveBeenCalled()
  })
})
