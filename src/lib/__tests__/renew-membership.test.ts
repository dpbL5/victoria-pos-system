import { describe, it, expect, vi, beforeEach } from 'vitest'

const fakeStore = vi.hoisted(() => ({
  session: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
  sessionPricingGroup: { create: vi.fn(), update: vi.fn(), findMany: vi.fn() },
  shift: { findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
  shiftParticipant: { create: vi.fn() },
  product: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
  stockMovement: { create: vi.fn() },
  invoice: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  invoiceItem: { create: vi.fn(), findMany: vi.fn() },
  payment: { create: vi.fn(), findMany: vi.fn() },
  membershipPayment: { create: vi.fn() },
  membership: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
  membershipPlan: { findUnique: vi.fn(), findMany: vi.fn() },
  customer: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), findMany: vi.fn() },
  appSetting: { findUnique: vi.fn(), upsert: vi.fn(), findMany: vi.fn() },
  pricingRule: { findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
  pricingTier: { findMany: vi.fn(), create: vi.fn() },
  promotionRule: { findUnique: vi.fn(), findMany: vi.fn() },
  activityLog: { create: vi.fn() },
  tool: { findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  shiftTool: { findUnique: vi.fn(), upsert: vi.fn() },
  cashflowEntry: { create: vi.fn(), update: vi.fn(), delete: vi.fn(), findMany: vi.fn() },
  user: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
}))

vi.mock('@/lib/infrastructure/prisma', () => ({
  prisma: { $transaction: (work: (store: unknown) => Promise<unknown>) => work(fakeStore) },
}))

import { renewMembership } from '@/lib/memberships/use-cases/renew-membership'
import { createRepositories } from '@/lib/infrastructure/repositories'

const repos = createRepositories(fakeStore as never)

function resetMocks() {
  vi.clearAllMocks()

  fakeStore.customer.findUnique.mockResolvedValue({
    id: 'cust-1', fullName: 'Nguyễn Văn A', phone: '0900000000', type: 'MEMBER',
    totalHoursPlayed: 0, totalSpent: 300000, notes: null,
  })
  fakeStore.membershipPlan.findUnique.mockResolvedValue({
    id: 'plan-1', name: 'Gói tháng', price: '300000', durationMonths: 1, isActive: true,
  })
  fakeStore.shift.findFirst.mockResolvedValue({ id: 'shift-1', status: 'OPEN' })

  // Membership gần nhất đang ACTIVE đến 2026-09-07 → renewal nối kỳ từ đó
  fakeStore.membership.findFirst.mockResolvedValue({
    id: 'mem-old', customerId: 'cust-1', planId: 'plan-1',
    startsAt: new Date('2026-08-07'), expiresAt: new Date('2026-09-07'), status: 'ACTIVE',
  })

  fakeStore.membership.create.mockResolvedValue({
    id: 'mem-new', customerId: 'cust-1', planId: 'plan-1', status: 'ACTIVE',
  })
  fakeStore.invoice.create.mockResolvedValue({ id: 'inv-1' })
  fakeStore.invoiceItem.create.mockResolvedValue({ id: 'item-1' })
  fakeStore.payment.create.mockResolvedValue({ id: 'pay-1' })
  fakeStore.membershipPayment.create.mockResolvedValue({ id: 'mp-1' })
  fakeStore.customer.update.mockResolvedValue({})
}

const input = {
  staffId: 'staff-1',
  customerId: 'cust-1',
  planId: 'plan-1',
  paymentMethod: 'CASH' as const,
  paidAt: new Date('2026-08-10'),
}

describe('renewMembership', () => {
  beforeEach(resetMocks)

  it('trả CUSTOMER_NOT_FOUND khi khách không tồn tại', async () => {
    fakeStore.customer.findUnique.mockResolvedValue(null)
    const result = await renewMembership(input, repos)
    expect(result).toEqual({ ok: false, error: { code: 'CUSTOMER_NOT_FOUND' } })
  })

  it('trả SHIFT_REQUIRED khi chưa có ca mở', async () => {
    fakeStore.shift.findFirst.mockResolvedValue(null)
    const result = await renewMembership(input, repos)
    expect(result).toEqual({ ok: false, error: { code: 'SHIFT_REQUIRED' } })
  })

  it('trả PLAN_NOT_FOUND khi gói không tồn tại hoặc ngừng dùng', async () => {
    fakeStore.membershipPlan.findUnique.mockResolvedValue(null)
    const result = await renewMembership(input, repos)
    expect(result).toEqual({ ok: false, error: { code: 'PLAN_NOT_FOUND' } })
  })

  it('nối kỳ từ expiresAt khi hội viên còn hạn', async () => {
    const result = await renewMembership(input, repos)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    // expiresAt cũ là 2026-09-07 → kỳ mới bắt đầu từ đó, +1 tháng → 2026-10-07
    expect(result.value.expiresAt.toISOString().slice(0, 10)).toBe('2026-10-07')

    const membershipCall = fakeStore.membership.create.mock.calls[0][0]
    expect(membershipCall.data.startsAt.toISOString().slice(0, 10)).toBe('2026-09-07')
    expect(membershipCall.data.expiresAt.toISOString().slice(0, 10)).toBe('2026-10-07')

    // Invoice MEMBERSHIP_FEE 300k + Payment + MembershipPayment + audit
    expect(fakeStore.invoice.create).toHaveBeenCalled()
    expect(fakeStore.payment.create).toHaveBeenCalled()
    expect(fakeStore.membershipPayment.create).toHaveBeenCalled()
    expect(fakeStore.activityLog.create).toHaveBeenCalled()
  })

  it('bắt đầu kỳ mới từ paidAt khi hội viên đã hết hạn', async () => {
    // Membership hết hạn từ 2026-01-01
    fakeStore.membership.findFirst.mockResolvedValue({
      id: 'mem-old', customerId: 'cust-1', planId: 'plan-1',
      startsAt: new Date('2025-12-07'), expiresAt: new Date('2026-01-01'), status: 'ACTIVE',
    })
    const result = await renewMembership(input, repos)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    const membershipCall = fakeStore.membership.create.mock.calls[0][0]
    // startsAt = paidAt (2026-08-10), expiresAt = +1 tháng → 2026-09-10
    expect(membershipCall.data.startsAt.toISOString().slice(0, 10)).toBe('2026-08-10')
    expect(membershipCall.data.expiresAt.toISOString().slice(0, 10)).toBe('2026-09-10')
  })
})
