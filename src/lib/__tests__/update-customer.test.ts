import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock prisma singleton: $transaction chạy work với fake store → toàn bộ
// use-case (pre-tx + in-tx) đi qua real adapters nhưng không cần database.
const fakeStore = vi.hoisted(() => ({
  customer: { findUnique: vi.fn(), update: vi.fn() },
  activityLog: { create: vi.fn() },
}))

vi.mock('@/lib/infrastructure/prisma', () => ({
  prisma: { $transaction: (work: (store: unknown) => Promise<unknown>) => work(fakeStore) },
}))

import { updateCustomer, mapUpdateCustomerError } from '@/lib/memberships'
import { createRepositories } from '@/lib/infrastructure/repositories'

const repos = createRepositories(fakeStore as never)

function resetMocks() {
  vi.clearAllMocks()
  fakeStore.customer.findUnique.mockResolvedValue({
    id: 'cust-1',
    fullName: 'Nguyễn Văn A',
    phone: '0901234567',
    type: 'WALK_IN' as const,
    totalHoursPlayed: 0 as never,
    totalSpent: 0 as never,
    notes: null,
    deletedAt: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  })
  fakeStore.customer.update.mockResolvedValue({
    id: 'cust-1',
    fullName: 'Nguyễn Văn B',
    phone: '0901234567',
    type: 'WALK_IN' as const,
    totalHoursPlayed: 0 as never,
    totalSpent: 0 as never,
    notes: null,
    deletedAt: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-08-09'),
  })
  fakeStore.activityLog.create.mockResolvedValue({})
}

describe('updateCustomer', () => {
  beforeEach(resetMocks)

  it('không tìm thấy khách → CUSTOMER_NOT_FOUND', async () => {
    fakeStore.customer.findUnique.mockResolvedValue(null)
    const result = await updateCustomer({ staffId: 'staff-1', customerId: 'cust-x', fullName: 'Test' }, repos)
    expect(result).toEqual({ ok: false, error: { code: 'CUSTOMER_NOT_FOUND' } })
    expect(fakeStore.customer.update).not.toHaveBeenCalled()
  })

  it('cập nhật fullName + audit CUSTOMER_UPDATE trong transaction', async () => {
    const result = await updateCustomer(
      { staffId: 'staff-1', customerId: 'cust-1', fullName: 'Nguyễn Văn B' },
      repos
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value.customer.fullName).toBe('Nguyễn Văn B')
    expect(fakeStore.customer.update).toHaveBeenCalledWith({ where: { id: 'cust-1' }, data: { fullName: 'Nguyễn Văn B' } })
    const auditCall = fakeStore.activityLog.create.mock.calls[0][0]
    expect(auditCall.data).toMatchObject({
      userId: 'staff-1',
      action: 'CUSTOMER_UPDATE',
      entityType: 'Customer',
      entityId: 'cust-1',
      details: {
        before: { fullName: 'Nguyễn Văn A', phone: '0901234567' },
        after: { fullName: 'Nguyễn Văn B', phone: '0901234567' },
      },
    })
  })

  it('chuẩn hóa phone rỗng thành null', async () => {
    await updateCustomer(
      { staffId: 'staff-1', customerId: 'cust-1', phone: '' },
      repos
    )

    expect(fakeStore.customer.update).toHaveBeenCalledWith({ where: { id: 'cust-1' }, data: { phone: null } })
  })

  it('không gửi field không được cung cấp (chỉ cập nhật notes)', async () => {
    await updateCustomer(
      { staffId: 'staff-1', customerId: 'cust-1', notes: 'Ghi chú mới' },
      repos
    )

    expect(fakeStore.customer.update).toHaveBeenCalledWith({ where: { id: 'cust-1' }, data: { notes: 'Ghi chú mới' } })
  })

  it('mapUpdateCustomerError mapping đúng status', () => {
    expect(mapUpdateCustomerError({ code: 'CUSTOMER_NOT_FOUND' } as never)).toMatchObject({ status: 404 })
  })
})
