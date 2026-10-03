import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/infrastructure/prisma', () => ({ prisma: {} }))

// Container cho fake repos — mock factory đọc qua getter để tránh hoisting
const state = vi.hoisted(() => ({ txForTest: null as unknown }))

vi.mock('@/lib/infrastructure/db-helpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/infrastructure/db-helpers')>()
  return {
    ...actual,
    runInTransaction: vi.fn(async (work: (repos: unknown) => Promise<unknown>) => {
      try {
        const value = await work(state.txForTest)
        return { ok: true, value } as const
      } catch (e) {
        if (e instanceof actual.RollbackSignal) {
          return { ok: false, error: (e as { error: { code: string } }).error } as const
        }
        throw e
      }
    }),
  }
})

import { checkInBooking } from '@/lib/sessions/use-cases/check-in-booking'
import type { Repositories } from '@/lib/infrastructure/repositories'

const OPENED_AT = new Date(Date.now() - 60 * 60_000)

const BOOKING = {
  id: 'booking-1',
  status: 'BOOKED',
  customerId: null,
  customerName: 'Khách A',
  customerPhone: null,
  playerCount: 2,
}

function makeTx() {
  return {
    shift: {
      findOpenForStaff: vi.fn(async () => ({ id: 'shift-1', openedAt: OPENED_AT })),
      findOpenIdForStaff: vi.fn(async () => ({ id: 'shift-1' })),
    },
    session: {
      findActiveByCustomer: vi.fn(async () => null),
      countCreatedBetween: vi.fn(async () => 0),
      createWithRefs: vi.fn(async (input: { playerCount: number }) => ({
        id: 'session-1',
        customerId: null,
        staffId: 'staff-1',
        shiftId: 'shift-1',
        membershipId: null,
        startTime: new Date(),
        hourlyRate: 0,
        pricingRuleId: null,
        pricingRuleSnapshot: null,
        playerCount: input.playerCount,
        status: 'ACTIVE',
        customer: null,
        membership: null,
        shift: { id: 'shift-1', openedAt: OPENED_AT, status: 'OPEN' },
      })),
      createPricingGroup: vi.fn(async () => ({ id: 'group-1' })),
      createPlayersForGroup: vi.fn(async () => {}),
    },
    booking: {
      updateBooked: vi.fn(async () => ({ count: 1 })),
      markCheckedIn: vi.fn(async () => ({ count: 1 })),
    },
    audit: { append: vi.fn(async () => ({})) },
  }
}

function makeDeps(booking: Record<string, unknown> | null) {
  return {
    booking: { findById: vi.fn(async () => booking) },
    customer: { findById: vi.fn() },
    membership: { findActive: vi.fn() },
  } as unknown as Repositories
}

describe('checkInBooking — số người chơi nhập lúc xác nhận', () => {
  it('nhập số mới: phiên chơi tạo theo số thực tế, lịch đặt ghi lại số đó', async () => {
    const tx = makeTx()
    state.txForTest = tx

    const result = await checkInBooking(
      { bookingId: 'booking-1', staffId: 'staff-1', playerCount: 4 },
      makeDeps(BOOKING)
    )

    expect(result.ok).toBe(true)
    expect(tx.session.createWithRefs).toHaveBeenCalledWith(expect.objectContaining({ playerCount: 4 }))
    expect(tx.session.createPricingGroup).toHaveBeenCalledWith(
      expect.objectContaining({ playerCount: 4, remainingCount: 4 })
    )
    expect(tx.session.createPlayersForGroup).toHaveBeenCalledWith('session-1', 'group-1', 4)
    expect(tx.booking.updateBooked).toHaveBeenCalledWith('booking-1', { playerCount: 4 })
    expect(tx.booking.markCheckedIn).toHaveBeenCalledWith('booking-1', 'session-1')
    expect(tx.audit.append).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'BOOKING_CHECK_IN',
        details: expect.objectContaining({ playerCount: 4 }),
      })
    )
  })

  it('không nhập: giữ nguyên số người của lịch, không ghi lại lịch đặt', async () => {
    const tx = makeTx()
    state.txForTest = tx

    const result = await checkInBooking(
      { bookingId: 'booking-1', staffId: 'staff-1' },
      makeDeps(BOOKING)
    )

    expect(result.ok).toBe(true)
    expect(tx.session.createWithRefs).toHaveBeenCalledWith(expect.objectContaining({ playerCount: 2 }))
    expect(tx.booking.updateBooked).not.toHaveBeenCalled()
  })
})
