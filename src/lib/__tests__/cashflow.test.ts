import { describe, it, expect, vi, beforeEach } from 'vitest'

const fakeStore = vi.hoisted(() => ({
  cashflowEntry: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), delete: vi.fn(), findMany: vi.fn() },
  activityLog: { create: vi.fn() },
}))

vi.mock('@/lib/infrastructure/prisma', () => ({
  prisma: { $transaction: (work: (store: unknown) => Promise<unknown>) => work(fakeStore) },
}))

import { createCashflow } from '@/lib/cashflow/use-cases/create-cashflow'
import { createRepositories } from '@/lib/infrastructure/repositories'

// createCashflow không nhận deps — dùng singleton repositories.
// Mock $transaction chạy với fakeStore → tx.cashflow = cashflow-adapter trên fakeStore.
const repos = createRepositories(fakeStore as never)

function resetMocks() {
  vi.clearAllMocks()
  fakeStore.cashflowEntry.create.mockResolvedValue({
    id: 'cf-1', type: 'EXPENSE', personName: 'Mua nước', amount: 50000,
    reason: 'Nhập kho', shiftId: null, staffId: 'staff-1',
    createdAt: new Date('2026-08-10'), updatedAt: new Date('2026-08-10'),
  })
}

describe('createCashflow', () => {
  beforeEach(resetMocks)

  it('tạo khoản chi + ghi audit', async () => {
    const result = await createCashflow({
      staffId: 'staff-1',
      type: 'EXPENSE',
      personName: 'Mua nước',
      amount: 50000,
      reason: 'Nhập kho',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.cashflow).toMatchObject({ id: 'cf-1', type: 'EXPENSE', amount: 50000 })

    expect(fakeStore.cashflowEntry.create).toHaveBeenCalled()
    const auditCall = fakeStore.activityLog.create.mock.calls[0][0]
    expect(auditCall.data).toMatchObject({
      userId: 'staff-1',
      action: 'CASHFLOW_CREATE',
      entityType: 'CashflowEntry',
    })
  })
})
