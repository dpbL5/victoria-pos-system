import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Integration API test: GET /api/bookings ──
// Mock prisma (fake store) + auth. Kiểm tra hợp đồng HTTP và auto-cancel lịch quá ngày.

const fakeStore = vi.hoisted(() => {
  const store = {
    booking: { findMany: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    activityLog: { create: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    appSetting: { findUnique: vi.fn(), findMany: vi.fn(), upsert: vi.fn() },
  }
  return {
    ...store,
    $transaction: (work: (tx: unknown) => Promise<unknown>) => work(store),
  }
})

vi.mock('@/lib/infrastructure/prisma', () => ({ prisma: fakeStore }))

vi.mock('@/lib/shared/auth', () => ({
  requireAuth: vi.fn(async () => ({ userId: 'staff-1', username: 'nv_a', fullName: 'Nhân viên A', role: 'STAFF' })),
  requireMutationAuth: vi.fn(async () => ({ userId: 'staff-1', username: 'nv_a', fullName: 'Nhân viên A', role: 'STAFF' })),
}))

import { GET as bookingsGet } from '@/app/api/bookings/route'
import { parseStartOfDay, today } from '@/lib/shared/utils'

const WEEK_START = '2026-09-28' // thứ Hai

const STALE_BOOKING = {
  id: '11111111-1111-4111-8111-111111111111',
  status: 'BOOKED',
  scheduledAt: new Date('2020-01-01T02:00:00.000Z'),
  depositAmount: 0,
  depositAppliedAmount: 0,
  depositRefundedAmount: 0,
}

const WEEK_ROWS = [{ id: 'row-1', status: 'BOOKED' }]

function getBookings(weekStart = WEEK_START) {
  return bookingsGet(new NextRequest(`http://localhost/api/bookings?weekStart=${weekStart}`, { method: 'GET' }))
}

describe('GET /api/bookings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fakeStore.booking.findMany.mockReset()
    fakeStore.booking.updateMany.mockResolvedValue({ count: 1 })
    fakeStore.activityLog.create.mockResolvedValue({})
  })

  it('tự huỷ lịch BOOKED quá ngày không còn cọc rồi trả danh sách tuần', async () => {
    fakeStore.booking.findMany
      .mockResolvedValueOnce([STALE_BOOKING])
      .mockResolvedValueOnce(WEEK_ROWS)

    const res = await getBookings()
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json).toEqual({ success: true, data: WEEK_ROWS })

    // Lần đọc đầu là sweep: chỉ lịch BOOKED trước 00:00 hôm nay theo giờ VN
    expect(fakeStore.booking.findMany).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: {
        scheduledAt: { gte: new Date(0), lt: parseStartOfDay(today()) },
        status: { in: ['BOOKED'] },
      },
    }))
    expect(fakeStore.booking.updateMany).toHaveBeenCalledWith({
      where: { id: STALE_BOOKING.id, status: 'BOOKED', depositAmount: 0 },
      data: { status: 'CANCELLED' },
    })
    expect(fakeStore.activityLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'staff-1',
        action: 'BOOKING_CANCELLED',
        entityType: 'Booking',
        entityId: STALE_BOOKING.id,
        details: { autoCancelled: true, scheduledAt: '2020-01-01T02:00:00.000Z' },
      }),
    })
  })

  it('không tự huỷ lịch còn cọc chưa xử lý', async () => {
    fakeStore.booking.findMany
      .mockResolvedValueOnce([{ ...STALE_BOOKING, depositAmount: 100000 }])
      .mockResolvedValueOnce([])

    const res = await getBookings()
    expect(res.status).toBe(200)
    expect(fakeStore.booking.updateMany).not.toHaveBeenCalled()
    expect(fakeStore.activityLog.create).not.toHaveBeenCalled()
  })
})
