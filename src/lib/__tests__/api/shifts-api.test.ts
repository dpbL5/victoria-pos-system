import { describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const getShiftDayGroups = vi.hoisted(() => vi.fn(async () => []))
vi.mock('@/lib/infrastructure/repositories', () => ({
  repositories: { reporting: { getShiftDayGroups } },
}))
vi.mock('@/lib/shared/auth', () => ({
  requireAuth: vi.fn(async () => ({ userId: 'manager-1', role: 'MANAGER' })),
  requireMutationAuth: vi.fn(),
}))

import { GET } from '@/app/api/shifts/route'

describe('GET /api/shifts — lọc ngày mở ca', () => {
  it.each([
    ['2026-10-04', '2026-10-03T17:00:00.000Z', '2026-10-04T17:00:00.000Z'],
    ['2025-01-01', '2024-12-31T17:00:00.000Z', '2025-01-01T17:00:00.000Z'],
  ])('lọc đủ ngày VN %s, kể cả lịch sử ngoài 90 ngày', async (day, from, to) => {
    const response = await GET(new NextRequest(
      `http://localhost/api/shifts?groupBy=day&from=${day}&to=${day}&status=CLOSED&page=1`,
    ))

    expect(response.status).toBe(200)
    expect(getShiftDayGroups).toHaveBeenLastCalledWith({
      from: new Date(from),
      to: new Date(to),
      status: 'CLOSED',
      scope: 'ALL',
      staffId: 'manager-1',
    })
    expect(await response.json()).toMatchObject({
      success: true,
      data: [],
      pagination: { page: 1, totalDays: 0, totalPages: 0 },
    })
  })
})
