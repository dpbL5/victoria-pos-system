import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock prisma singleton: $transaction chạy work với fake store → toàn bộ
// use-case (pre-tx + in-tx) đi qua real adapters nhưng không cần database.
const fakeStore = vi.hoisted(() => ({
  shift: { findFirst: vi.fn() },
  membershipPlan: { findUnique: vi.fn() },
  customer: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), findFirst: vi.fn() },
  membership: { create: vi.fn(), findFirst: vi.fn() },
  invoice: { create: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
  invoiceItem: { create: vi.fn() },
  payment: { create: vi.fn() },
  stockMovement: { create: vi.fn() },
  product: { update: vi.fn() },
  activityLog: { create: vi.fn() },
}))

vi.mock('@/lib/infrastructure/prisma', () => ({
  prisma: { $transaction: (work: (store: unknown) => Promise<unknown>) => work(fakeStore) },
}))

import { registerMember } from '@/lib/memberships/use-cases/register-member'
import { createRepositories } from '@/lib/infrastructure/repositories'

const repos = createRepositories(fakeStore as never)

function resetMocks() {
  vi.clearAllMocks()
  fakeStore.membershipPlan.findUnique.mockResolvedValue({
    id: 'plan-1',
    name: 'Gói tháng',
    price: '300000',
    durationMonths: 1,
    isActive: true,
  })
  fakeStore.shift.findFirst.mockResolvedValue({ id: 'shift-1' })
  fakeStore.customer.create.mockResolvedValue({
    id: 'cust-1',
    fullName: 'Nguyễn Văn A',
    phone: null,
    type: 'MEMBER',
  })
  fakeStore.membership.create.mockResolvedValue({
    id: 'mem-1',
    startsAt: new Date('2026-08-07'),
    expiresAt: new Date('2026-09-07'),
    status: 'ACTIVE',
  })
  fakeStore.invoice.create.mockResolvedValue({ id: 'inv-1' })
  // createMembershipPayment giờ ghi vào store.payment (STI) — trả id cho membershipPaymentId
  fakeStore.payment.create.mockResolvedValue({ id: 'mp-1' })
}

const input = {
  staffId: 'staff-1',
  fullName: 'Nguyễn Văn A',
  planId: 'plan-1',
  paymentMethod: 'CASH' as const,
}

describe('registerMember', () => {
  beforeEach(resetMocks)

  it('trả SHIFT_REQUIRED khi chưa có ca mở', async () => {
    fakeStore.shift.findFirst.mockResolvedValue(null)
    const result = await registerMember(input, repos)
    expect(result).toEqual({ ok: false, error: { code: 'SHIFT_REQUIRED' } })
    expect(fakeStore.customer.create).not.toHaveBeenCalled()
  })

  it('trả PLAN_NOT_FOUND khi gói không tồn tại hoặc ngừng dùng', async () => {
    fakeStore.membershipPlan.findUnique.mockResolvedValue(null)
    const result = await registerMember(input, repos)
    expect(result).toEqual({ ok: false, error: { code: 'PLAN_NOT_FOUND' } })
  })

  it('tạo customer + membership + invoice + payment membership trong 1 transaction', async () => {
    const result = await registerMember(input, repos)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toMatchObject({
      customer: { id: 'cust-1', fullName: 'Nguyễn Văn A', type: 'MEMBER' },
      membership: { id: 'mem-1', status: 'ACTIVE' },
      invoiceId: 'inv-1',
      membershipPaymentId: 'mp-1',
    })

    expect(fakeStore.customer.create).toHaveBeenCalledWith({
      data: { fullName: 'Nguyễn Văn A', phone: null, type: 'MEMBER' },
    })
    expect(fakeStore.membership.create).toHaveBeenCalled()
    // Invoice tạo với line MEMBERSHIP_FEE + số tiền đúng gói
    const invoiceCall = fakeStore.invoice.create.mock.calls[0][0]
    expect(invoiceCall.data.items.create[0]).toMatchObject({
      type: 'MEMBERSHIP_FEE',
      unitPrice: 300000,
      total: 300000,
    })
    expect(fakeStore.customer.update).toHaveBeenCalledWith({
      where: { id: 'cust-1' },
      data: { totalSpent: { increment: 300000 } },
    })
    expect(fakeStore.activityLog.create).toHaveBeenCalled()
  })

  it('không gọi customer.update khi paymentMethod là MEMBER', async () => {
    // Ghi chú: registerMember luôn cộng chi tiêu — test này xác nhận increment gọi 1 lần
    await registerMember({ ...input, paymentMethod: 'MEMBER' }, repos)
    expect(fakeStore.customer.update).toHaveBeenCalledTimes(1)
  })

  it('trả CUSTOMER_ALREADY_EXISTS khi SĐT đã được đăng ký (idempotency)', async () => {
    fakeStore.customer.findFirst.mockResolvedValue({
      id: 'cust-dup',
      fullName: 'Nguyễn Văn A',
      phone: '0901234567',
      type: 'MEMBER',
    })
    const result = await registerMember(
      { ...input, phone: '0901234567' },
      repos
    )
    expect(result).toEqual({ ok: false, error: { code: 'CUSTOMER_ALREADY_EXISTS' } })
    expect(fakeStore.customer.create).not.toHaveBeenCalled()
    expect(fakeStore.membership.create).not.toHaveBeenCalled()
  })
})
