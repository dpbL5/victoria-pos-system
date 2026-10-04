import { describe, it, expect, vi, beforeEach } from 'vitest'

const fakeStore = vi.hoisted(() => ({
  cashflowEntry: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), delete: vi.fn(), findMany: vi.fn() },
  activityLog: { create: vi.fn() },
}))

vi.mock('@/lib/infrastructure/prisma', () => ({
  prisma: { $transaction: (work: (store: unknown) => Promise<unknown>) => work(fakeStore) },
}))

import { createCashflow } from '@/lib/cashflow/use-cases/create-cashflow'
import { buildCashflowWhere } from '@/lib/cashflow/helpers'

const OCCURRED_AT = new Date('2026-08-05T00:00:00.000Z')

function resetMocks() {
  vi.clearAllMocks()
  fakeStore.cashflowEntry.create.mockResolvedValue({
    id: 'cf-1', type: 'EXPENSE', personName: 'Mua nước', amount: 50000,
    reason: 'Nhập kho', occurredAt: OCCURRED_AT, staffId: 'staff-1',
    createdAt: new Date('2026-08-10'), updatedAt: new Date('2026-08-10'),
  })
}

describe('createCashflow', () => {
  beforeEach(resetMocks)

  it('tạo khoản chi + ghi audit kèm ngày phát sinh', async () => {
    const result = await createCashflow({
      staffId: 'staff-1',
      type: 'EXPENSE',
      personName: 'Mua nước',
      amount: 50000,
      reason: 'Nhập kho',
      occurredAt: OCCURRED_AT,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.cashflow).toMatchObject({ id: 'cf-1', type: 'EXPENSE', amount: 50000 })

    expect(fakeStore.cashflowEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ occurredAt: OCCURRED_AT }) }),
    )
    const auditCall = fakeStore.activityLog.create.mock.calls[0][0]
    expect(auditCall.data).toMatchObject({
      userId: 'staff-1',
      action: 'CASHFLOW_CREATE',
      entityType: 'CashflowEntry',
      details: expect.objectContaining({ occurredAt: OCCURRED_AT.toISOString() }),
    })
  })
})

describe('buildCashflowWhere', () => {
  it('lọc theo khoảng ngày phát sinh [from, to)', () => {
    const from = new Date('2026-08-01T00:00:00.000Z')
    const to = new Date('2026-09-01T00:00:00.000Z')
    expect(buildCashflowWhere({ type: 'INCOME', from, to })).toEqual({
      type: 'INCOME',
      occurredAt: { gte: from, lt: to },
    })
  })

  it('không type, không khoảng → where rỗng', () => {
    expect(buildCashflowWhere()).toEqual({})
  })

  it('chỉ có from → chỉ gte', () => {
    const from = new Date('2026-08-01T00:00:00.000Z')
    expect(buildCashflowWhere({ from })).toEqual({ occurredAt: { gte: from } })
  })
})
