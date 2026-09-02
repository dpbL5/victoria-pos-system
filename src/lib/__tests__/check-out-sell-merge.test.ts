import { describe, it, expect, vi, beforeEach } from 'vitest'

// Fake store qua vi.hoisted → mock $transaction chạy work với fake store.
const fakeStore = vi.hoisted(() => ({
  session: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  sessionPricingGroup: { create: vi.fn(), update: vi.fn(), findMany: vi.fn() },
  sessionPlayer: { createMany: vi.fn(), updateMany: vi.fn(), findMany: vi.fn() },
  sessionSellItem: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), deleteMany: vi.fn() },
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
  invoice: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), count: vi.fn() },
  invoiceItem: { create: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn() },
  payment: { create: vi.fn(), findMany: vi.fn(), count: vi.fn() },
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

import { checkOut } from '@/lib/sessions/use-cases/check-out'
import { createRepositories } from '@/lib/infrastructure/repositories'

const repos = createRepositories(fakeStore as never)

function resetMocks() {
  vi.clearAllMocks()

  // Session hội viên ACTIVE — có sẵn pricing snapshot để không cần resolve rule
  fakeStore.session.findUnique.mockResolvedValue({
    id: 'sess-1',
    status: 'ACTIVE',
    customerId: 'cust-1',
    customerName: null,
    membershipId: 'mem-1',
    staffId: 'staff-1',
    shiftId: 'shift-1',
    startTime: new Date('2026-08-07T10:00:00'),
    endTime: null,
    playerCount: 1,
    hourlyRate: 0,
    totalPausedSeconds: 0,
    customer: { id: 'cust-1', type: 'MEMBER', fullName: 'Nguyễn Văn A' },
    membership: { id: 'mem-1', status: 'ACTIVE' },
    pricingGroups: [
      {
        id: 'group-1',
        label: 'Nhóm 1',
        playerCount: 1,
        remainingCount: 1,
        hourlyRate: 0,
        pricingRuleId: null,
        pricingSnapshot: null,
        players: [],
      },
    ],
  })

  // Ca quầy mở
  fakeStore.shift.findFirst.mockResolvedValue({ id: 'shift-1', status: 'OPEN' })

  // Membership active (TOCTOU guard)
  fakeStore.membership.findFirst.mockResolvedValue({ id: 'mem-1', status: 'ACTIVE' })

  // Sản phẩm Nước
  fakeStore.product.findMany.mockResolvedValue([
    { id: 'prod-1', name: 'Nước suối', type: 'PRODUCT', price: 10000, stockQuantity: 10, isActive: true },
  ])
  fakeStore.product.findUnique.mockResolvedValue({
    id: 'prod-1', name: 'Nước suối', type: 'PRODUCT', price: 10000, stockQuantity: 10, isActive: true,
  })

  // Bán kèm chờ thu: 2 nước
  fakeStore.sessionSellItem.findMany.mockResolvedValue([
    { id: 'ssi-1', sessionId: 'sess-1', productId: 'prod-1', quantity: 2, unitPrice: 10000, notes: null, createdAt: new Date() },
  ])

  // Invoice PAID + item + payment
  fakeStore.invoice.create.mockResolvedValue({ id: 'inv-1', invoiceNo: 'INV-1' })
  fakeStore.invoiceItem.create.mockResolvedValue({ id: 'item-1' })
  fakeStore.payment.create.mockResolvedValue({ id: 'pay-1' })
  fakeStore.invoice.count.mockResolvedValue(0)

  // Cập nhật group/session
  fakeStore.sessionPricingGroup.update.mockResolvedValue({ remainingCount: 0 })
  fakeStore.sessionPricingGroup.findMany.mockResolvedValue([{ remainingCount: 0 }])
  fakeStore.session.update.mockResolvedValue({})

  fakeStore.product.updateMany.mockResolvedValue({ count: 1 })
}

describe('checkOut — gộp bán kèm không lặp hàng hoá', () => {
  beforeEach(resetMocks)

  it('hàng bán kèm chỉ tạo 1 InvoiceItem (không bị lặp với items request)', async () => {
    const result = await checkOut(
      {
        sessionId: 'sess-1',
        staffId: 'staff-1',
        paymentMethod: 'CASH',
        items: [],
      },
      repos
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return

    // InvoiceItem được tạo: 1 PLAY_TIME + 1 cho hàng bán kèm (KHÔNG lặp)
    const itemCalls = fakeStore.invoiceItem.create.mock.calls
    const productItems = itemCalls.filter((c) => c[0].data?.productId === 'prod-1')
    expect(productItems).toHaveLength(1)

    const productItem = productItems[0][0].data
    expect(productItem).toMatchObject({
      productId: 'prod-1',
      quantity: 2,
      unitPrice: 10000,
      total: 20000,
    })

    // Kho KHÔNG bị trừ lại (đã trừ lúc bán kèm)
    expect(fakeStore.product.updateMany).not.toHaveBeenCalled()

    // Dòng bán kèm bị xoá sau khi gộp
    expect(fakeStore.sessionSellItem.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['ssi-1'] } },
    })
  })

  it('hàng mới gửi kèm request checkout vẫn trừ kho + tạo InvoiceItem riêng', async () => {
    // Không có bán kèm chờ thu
    fakeStore.sessionSellItem.findMany.mockResolvedValue([])

    const result = await checkOut(
      {
        sessionId: 'sess-1',
        staffId: 'staff-1',
        paymentMethod: 'CASH',
        items: [{ productId: 'prod-1', quantity: 2 }],
      },
      repos
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return

    const itemCalls = fakeStore.invoiceItem.create.mock.calls
    const productItems = itemCalls.filter((c) => c[0].data?.productId === 'prod-1')
    expect(productItems).toHaveLength(1)

    // Hàng mới → trừ kho + ghi stock movement
    expect(fakeStore.product.updateMany).toHaveBeenCalled()
    expect(fakeStore.stockMovement.create).toHaveBeenCalled()
  })
})
