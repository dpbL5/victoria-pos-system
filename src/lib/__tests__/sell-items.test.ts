import { describe, it, expect, vi, beforeEach } from 'vitest'

// Fake store qua vi.hoisted → mock $transaction chạy work với fake store.
// Toàn bộ use-case đi qua real adapters nhưng không cần database.
const fakeStore = vi.hoisted(() => ({
  session: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  sessionPricingGroup: { create: vi.fn(), update: vi.fn(), findMany: vi.fn() },
  shift: { findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
  shiftParticipant: { create: vi.fn() },
  product: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    create: vi.fn(),
  },
  stockMovement: { create: vi.fn() },
  invoice: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  invoiceItem: { create: vi.fn(), findMany: vi.fn() },
  payment: { create: vi.fn(), findMany: vi.fn() },
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

import { sellItems } from '@/lib/sessions/use-cases/sell-items'
import { createRepositories } from '@/lib/infrastructure/repositories'

const repos = createRepositories(fakeStore as never)

function resetMocks() {
  vi.clearAllMocks()

  // Session ACTIVE với khách hội viên
  fakeStore.session.findUnique.mockResolvedValue({
    id: 'sess-1',
    status: 'ACTIVE',
    customerId: 'cust-1',
    customerName: null,
    staffId: 'staff-1',
    shiftId: 'shift-1',
    startTime: new Date('2026-08-07T10:00:00'),
    endTime: null,
    playerCount: 1,
    totalPausedSeconds: 0,
    customer: { id: 'cust-1', type: 'MEMBER', fullName: 'Nguyễn Văn A' },
    membership: { id: 'mem-1', status: 'ACTIVE' },
  })

  // Ca quầy đang mở cho staff
  fakeStore.shift.findFirst.mockResolvedValue({ id: 'shift-1', status: 'OPEN' })

  // Sản phẩm trong kho
  fakeStore.product.findMany.mockResolvedValue([
    { id: 'prod-1', name: 'Nước suối', type: 'PRODUCT', price: 10000, costPrice: 5000, stockQuantity: 10, isActive: true },
  ])
  fakeStore.product.findUnique.mockResolvedValue({
    id: 'prod-1', name: 'Nước suối', type: 'PRODUCT', price: 10000, costPrice: 5000, stockQuantity: 10, isActive: true,
  })

  // Invoice DRAFT
  fakeStore.invoice.create.mockResolvedValue({ id: 'inv-1' })
  fakeStore.invoiceItem.create.mockResolvedValue({ id: 'item-1' })

  // Trừ kho thành công
  fakeStore.product.updateMany.mockResolvedValue({ count: 1 })
}

const input = {
  sessionId: 'sess-1',
  staffId: 'staff-1',
  items: [{ productId: 'prod-1', quantity: 2 }],
}

describe('sellItems', () => {
  beforeEach(resetMocks)

  it('trả SESSION_NOT_FOUND khi phiên không tồn tại', async () => {
    fakeStore.session.findUnique.mockResolvedValue(null)
    const result = await sellItems(input, repos)
    expect(result).toEqual({ ok: false, error: { code: 'SESSION_NOT_FOUND' } })
  })

  it('trả SESSION_COMPLETED khi phiên đã kết thúc', async () => {
    fakeStore.session.findUnique.mockResolvedValue({
      id: 'sess-1', status: 'COMPLETED', customerId: 'cust-1', customerName: null,
      staffId: 'staff-1', shiftId: 'shift-1', startTime: new Date('2026-08-07T10:00:00'),
      endTime: null, playerCount: 1, totalPausedSeconds: 0,
      customer: { id: 'cust-1', type: 'MEMBER', fullName: 'Nguyễn Văn A' },
      membership: { id: 'mem-1', status: 'ACTIVE' },
    })
    const result = await sellItems(input, repos)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('SESSION_COMPLETED')
  })

  it('tạo invoice DRAFT + trừ kho + ghi audit trong 1 transaction', async () => {
    const result = await sellItems(input, repos)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toMatchObject({ invoiceId: 'inv-1', grandTotal: 20000 })

    // Invoice DRAFT — chưa thanh toán
    const invoiceCall = fakeStore.invoice.create.mock.calls[0][0]
    expect(invoiceCall.data).toMatchObject({ sessionId: 'sess-1', shiftId: 'shift-1', grandTotal: 20000 })

    // Trừ kho 2 nước suối
    expect(fakeStore.product.updateMany).toHaveBeenCalledWith({
      where: { id: 'prod-1', stockQuantity: { gte: 2 } },
      data: { stockQuantity: { decrement: 2 } },
    })

    // Ghi stock movement SALE
    const movementCall = fakeStore.stockMovement.create.mock.calls[0][0]
    expect(movementCall.data).toMatchObject({ type: 'SALE', quantity: -2, productId: 'prod-1' })

    expect(fakeStore.activityLog.create).toHaveBeenCalled()
  })

  it('trả INSUFFICIENT_STOCK khi không đủ tồn', async () => {
    fakeStore.product.updateMany.mockResolvedValue({ count: 0 }) // trừ kho thất bại
    const result = await sellItems(input, repos)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('INSUFFICIENT_STOCK')
  })

  it('trả SHIFT_REQUIRED khi chưa có ca mở trong transaction', async () => {
    fakeStore.shift.findFirst.mockResolvedValue(null)
    const result = await sellItems(input, repos)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('SHIFT_REQUIRED')
  })
})
