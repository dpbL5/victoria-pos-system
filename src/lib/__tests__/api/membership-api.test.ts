import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Integration API test: POST /api/memberships/register + /renew ──
// Mock prisma singleton (fake store) + auth. Route handler dùng singleton
// `repositories` (import từ repositories.ts), nên fakeStore phải hoisted trước.

// Mock toàn bộ prisma client = fakeStore. Route handler dùng singleton `repositories`
// = createRepositories(prisma) → pre-tx query đi qua fakeStore. runInTransaction gọi
// prisma.$transaction → work(fakeStore) → in-tx cũng đi qua fakeStore.
const fakeStore = vi.hoisted(() => {
  const store = {
    shift: { findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
    shiftParticipant: { findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn(), upsert: vi.fn() },
    membershipPlan: { findUnique: vi.fn(), findMany: vi.fn() },
    customer: { create: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn(), findMany: vi.fn() },
    membership: { create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
    invoice: { create: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn(), delete: vi.fn() },
    invoiceItem: { create: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn() },
    payment: { create: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn(), count: vi.fn() },
    stockMovement: { create: vi.fn(), findMany: vi.fn() },
    product: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
    activityLog: { create: vi.fn(), findMany: vi.fn() },
    pricingRule: { findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
    pricingTier: { findMany: vi.fn(), create: vi.fn() },
    promotionRule: { findUnique: vi.fn(), findMany: vi.fn() },
    appSetting: { findUnique: vi.fn(), upsert: vi.fn(), findMany: vi.fn() },
    tool: { findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    shiftTool: { findUnique: vi.fn(), upsert: vi.fn() },
    cashflowEntry: { create: vi.fn(), update: vi.fn(), delete: vi.fn(), findMany: vi.fn() },
    user: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
  }
  return {
    ...store,
    $transaction: (work: (tx: unknown) => Promise<unknown>) => work(store),
  }
})

vi.mock('@/lib/infrastructure/prisma', () => ({ prisma: fakeStore }))

// Mock auth: bỏ qua JWT/CSRF/rate-limit — test hợp đồng HTTP + wiring use-case
vi.mock('@/lib/shared/auth', () => ({
  requireAuth: vi.fn(async () => ({ userId: 'staff-1', username: 'nv_a', fullName: 'Nhân viên A', role: 'STAFF' })),
  requireAdmin: vi.fn(async () => { throw new Error('FORBIDDEN') }),
  requireMutationAuth: vi.fn(async () => ({ userId: 'staff-1', username: 'nv_a', fullName: 'Nhân viên A', role: 'STAFF' })),
}))

import { POST as registerHandler } from '@/app/api/memberships/register/route'
import { POST as renewHandler } from '@/app/api/memberships/renew/route'
import { invoke } from '../helpers/api-test'

const PLAN_ID = '11111111-1111-4111-8111-111111111111'
const CUSTOMER_ID = '22222222-2222-4222-8222-222222222222'

function resetMocks() {
  vi.clearAllMocks()
  fakeStore.shift.findFirst.mockResolvedValue({ id: 'shift-1' })
  fakeStore.membershipPlan.findUnique.mockResolvedValue({
    id: 'plan-1', name: 'Gói tháng', price: '300000', durationMonths: 1, isActive: true,
  })
  fakeStore.customer.create.mockResolvedValue({ id: 'cust-1', fullName: 'Nguyễn Văn A', phone: null, type: 'MEMBER' })
  fakeStore.customer.findFirst.mockResolvedValue(null) // không trùng SĐT
  fakeStore.customer.findUnique.mockResolvedValue({ id: 'cust-1', fullName: 'Nguyễn Văn A', phone: '0900000000', type: 'MEMBER' })
  fakeStore.membership.create.mockResolvedValue({
    id: 'mem-1', startsAt: new Date('2026-08-10'), expiresAt: new Date('2026-09-10'), status: 'ACTIVE',
  })
  fakeStore.membership.findFirst.mockResolvedValue(null)
  fakeStore.invoice.create.mockResolvedValue({ id: 'inv-1' })
  fakeStore.payment.create.mockResolvedValue({ id: 'mp-1' })
}

describe('POST /api/memberships/register', () => {
  beforeEach(resetMocks)

  it('trả 400 VALIDATION khi body thiếu tên', async () => {
    const { status, json } = await invoke(registerHandler, {
      body: { planId: PLAN_ID, paymentMethod: 'CASH' },
    })
    expect(status).toBe(400)
    expect(json.success).toBe(false)
    expect(json.code).toBe('VALIDATION')
  })

  it('trả 201 khi đăng ký thành công', async () => {
    const { status, json } = await invoke(registerHandler, {
      body: { fullName: 'Nguyễn Văn A', planId: PLAN_ID, paymentMethod: 'CASH' },
    })
    expect(status).toBe(201)
    expect(json.success).toBe(true)
    expect(json.data).toMatchObject({
      customer: { id: 'cust-1', type: 'MEMBER' },
      membership: { id: 'mem-1', status: 'ACTIVE' },
      invoiceId: 'inv-1',
    })
  })

  it('trả 403 FORBIDDEN khi non-ADMIN đặt paidAt', async () => {
    const { status, json } = await invoke(registerHandler, {
      body: {
        fullName: 'Nguyễn Văn A', planId: PLAN_ID, paymentMethod: 'CASH',
        paidAt: '2026-08-10T00:00:00.000Z',
      },
    })
    expect(status).toBe(403)
    expect(json.code).toBe('FORBIDDEN')
  })
})

describe('POST /api/memberships/renew', () => {
  beforeEach(resetMocks)

  it('trả 400 VALIDATION khi body thiếu customerId', async () => {
    const { status, json } = await invoke(renewHandler, {
      body: { planId: PLAN_ID, paymentMethod: 'CASH' },
    })
    expect(status).toBe(400)
    expect(json.code).toBe('VALIDATION')
  })

  it('trả 201 khi gia hạn thành công', async () => {
    const { status, json } = await invoke(renewHandler, {
      body: { customerId: CUSTOMER_ID, planId: PLAN_ID, paymentMethod: 'CASH' },
    })
    expect(status).toBe(201)
    expect(json.success).toBe(true)
    expect(json.data).toMatchObject({
      membershipId: 'mem-1',
      invoiceId: 'inv-1',
    })
  })
})
