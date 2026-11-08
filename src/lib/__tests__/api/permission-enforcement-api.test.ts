import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Regression: role thiếu quyền phải bị chặn 403 ở các route vận hành ──
// Lỗi gốc: nhóm route POS/vận hành (check-in, checkout, bán hàng, lịch đặt,
// khách hàng, hội viên, mở ca) trước đây chỉ check đăng nhập — user gán role
// thiếu quyền vẫn thao tác được. Test này khoá hành vi: thiếu quyền → 403,
// có quyền → đi qua guard (dừng ở validation với body rỗng).

const fakeStore = vi.hoisted(() => {
  const store = {
    user: { findUnique: vi.fn(), upsert: vi.fn(), create: vi.fn() },
    booking: { findMany: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
    activityLog: { create: vi.fn(), findMany: vi.fn(), count: vi.fn(), deleteMany: vi.fn() },
    appSetting: { findUnique: vi.fn(), findMany: vi.fn(), upsert: vi.fn() },
    customer: { findMany: vi.fn(), count: vi.fn(), create: vi.fn() },
  }
  return {
    ...store,
    $transaction: (work: (tx: unknown) => Promise<unknown>) => work(store),
  }
})

vi.mock('@/lib/infrastructure/prisma', () => ({ prisma: fakeStore }))

// Mặc định: role KHÔNG có quyền nào (permissions rỗng, không phải ADMIN)
const permState = vi.hoisted(() => ({ allowed: false }))
vi.mock('@/lib/shared/auth', () => {
  const auth = { userId: 'staff-1', username: 'nv_a', fullName: 'Nhân viên A', role: null }
  return {
    requireAuth: vi.fn(async () => auth),
    requireMutationAuth: vi.fn(async () => auth),
    userHasPermission: vi.fn(() => permState.allowed),
    requirePermission: vi.fn(async () => {
      if (!permState.allowed) throw new Error('FORBIDDEN')
      return auth
    }),
  }
})

import { POST as sessionsPost } from '@/app/api/sessions/route'
import { POST as checkoutPost } from '@/app/api/sessions/[id]/checkout/route'
import { POST as retailPost } from '@/app/api/retail-sales/route'
import { POST as bookingsPost } from '@/app/api/bookings/route'
import { POST as customersPost, GET as customersGet } from '@/app/api/customers/route'
import { POST as registerPost } from '@/app/api/memberships/register/route'
import { POST as shiftsPost } from '@/app/api/shifts/route'
import { POST as closeShiftPost } from '@/app/api/shifts/[id]/close/route'
import { POST as toolCountsPost } from '@/app/api/shifts/[id]/tool-counts/route'
import { GET as reportsDashboardGet } from '@/app/api/reports/dashboard/route'
import { PATCH as renamePlayerPatch } from '@/app/api/sessions/[id]/players/[playerId]/route'
import { invoke } from '../helpers/api-test'

const SESSION_ID = '33333333-3333-4333-8333-333333333333'

describe('enforcement quyền trên route vận hành', () => {
  beforeEach(() => {
    permState.allowed = false
  })

  it('POST /api/sessions (check-in): thiếu quyền → 403', async () => {
    const { status } = await invoke(sessionsPost, { body: {} })
    expect(status).toBe(403)
  })

  it('POST /api/sessions (check-in): có quyền → qua guard, dừng ở validation', async () => {
    permState.allowed = true
    const { status } = await invoke(sessionsPost, { body: {} })
    expect(status).not.toBe(403)
  })

  it('POST /api/sessions/[id]/checkout: thiếu quyền → 403', async () => {
    const { status } = await invoke(checkoutPost, { body: {}, params: { id: SESSION_ID } })
    expect(status).toBe(403)
  })

  it('POST /api/retail-sales: thiếu quyền → 403', async () => {
    const { status } = await invoke(retailPost, { body: {} })
    expect(status).toBe(403)
  })

  it('POST /api/bookings: thiếu quyền → 403', async () => {
    const { status } = await invoke(bookingsPost, { body: {} })
    expect(status).toBe(403)
  })

  it('POST /api/customers: thiếu quyền → 403', async () => {
    const { status } = await invoke(customersPost, { body: {} })
    expect(status).toBe(403)
  })

  it('POST /api/memberships/register: thiếu quyền → 403', async () => {
    const { status } = await invoke(registerPost, { body: {} })
    expect(status).toBe(403)
  })

  it('POST /api/shifts (mở ca): thiếu quyền → 403', async () => {
    const { status } = await invoke(shiftsPost, { body: {} })
    expect(status).toBe(403)
  })

  it('POST /api/shifts/[id]/close: thiếu quyền shifts.close → 403', async () => {
    const { status } = await invoke(closeShiftPost, { body: {}, params: { id: 'shift-1' } })
    expect(status).toBe(403)
  })

  it('POST /api/shifts/[id]/close: có quyền → qua guard, dừng ở validation', async () => {
    permState.allowed = true
    const { status } = await invoke(closeShiftPost, { body: {}, params: { id: 'shift-1' } })
    expect(status).not.toBe(403)
  })

  it('POST /api/shifts/[id]/tool-counts: thiếu quyền tools.count → 403', async () => {
    const { status } = await invoke(toolCountsPost, { body: {}, params: { id: 'shift-1' } })
    expect(status).toBe(403)
  })

  it('GET /api/customers: thiếu quyền → 403', async () => {
    const req = new NextRequest('http://localhost/api/customers', { method: 'GET' })
    const res = await customersGet(req)
    expect(res.status).toBe(403)
  })

  it('GET /api/reports/dashboard: thiếu quyền reports.* → 403', async () => {
    const res = await reportsDashboardGet()
    expect(res.status).toBe(403)
  })

  it('GET /api/reports/dashboard: có quyền → qua gate, không 403', async () => {
    permState.allowed = true
    const res = await reportsDashboardGet()
    expect(res.status).not.toBe(403)
  })

  it('PATCH rename-player: thiếu quyền sessions.checkin → 403 (kể cả phiên của mình)', async () => {
    const { status } = await invoke(renamePlayerPatch, {
      method: 'PATCH',
      body: { name: 'Lan' },
      params: { id: SESSION_ID, playerId: 'player-1' },
    })
    expect(status).toBe(403)
  })

  it('PATCH rename-player: có quyền → qua gate, dừng ở validation', async () => {
    permState.allowed = true
    const { status } = await invoke(renamePlayerPatch, {
      method: 'PATCH',
      body: {},
      params: { id: SESSION_ID, playerId: 'player-1' },
    })
    expect(status).not.toBe(403)
  })
})
