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

  it('dòng bán kèm có trong danh sách cuối: chỉ 1 InvoiceItem, không lặp, không trừ kho', async () => {
    const result = await checkOut(
      {
        sessionId: 'sess-1',
        staffId: 'staff-1',
        paymentMethod: 'CASH',
        // Danh sách cuối của phiếu — kèm chính dòng bán kèm, số lượng giữ nguyên
        items: [{ productId: 'prod-1', quantity: 2 }],
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

    // Kho KHÔNG bị trừ lại (đã trừ lúc bán kèm) và không có chênh lệch để bù
    expect(fakeStore.product.updateMany).not.toHaveBeenCalled()
    expect(fakeStore.stockMovement.create).not.toHaveBeenCalled()

    // Dòng bán kèm bị xoá sau khi gộp
    expect(fakeStore.sessionSellItem.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['ssi-1'] } },
    })
  })

  it('client không gửi items: giữ nguyên dòng bán kèm (không hoà giải)', async () => {
    const result = await checkOut(
      {
        sessionId: 'sess-1',
        staffId: 'staff-1',
        paymentMethod: 'CASH',
      },
      repos
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return

    const productItems = fakeStore.invoiceItem.create.mock.calls.filter(
      (c) => c[0].data?.productId === 'prod-1'
    )
    expect(productItems).toHaveLength(1)
    expect(productItems[0][0].data).toMatchObject({ quantity: 2, unitPrice: 10000 })
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

// ── Sửa số lượng ngay tại chân phiếu: danh sách cuối quyết định tồn kho ──────
describe('checkOut — hoà giải số lượng dòng bán kèm theo danh sách cuối', () => {
  beforeEach(resetMocks)

  const checkoutWith = (items?: Array<{ productId: string; quantity: number }>) =>
    checkOut(
      { sessionId: 'sess-1', staffId: 'staff-1', paymentMethod: 'CASH', items },
      repos
    )

  it('tăng số lượng: trừ kho đúng phần chênh lệch, giữ giá đã chốt lúc bán kèm', async () => {
    const result = await checkoutWith([{ productId: 'prod-1', quantity: 5 }])
    expect(result.ok).toBe(true)

    // Dòng bán kèm đã trừ 2 lúc thêm; giờ phiếu có 5 → trừ thêm 3, không trừ lại từ đầu
    expect(fakeStore.product.updateMany).toHaveBeenCalledWith({
      where: { id: 'prod-1', stockQuantity: { gte: 3 } },
      data: { stockQuantity: { decrement: 3 } },
    })
    expect(fakeStore.stockMovement.create.mock.calls[0][0].data).toMatchObject({
      type: 'SALE',
      quantity: -3,
    })

    // InvoiceItem theo số lượng cuối, giá vẫn là giá chốt lúc bán kèm
    const productItem = fakeStore.invoiceItem.create.mock.calls
      .map((c) => c[0].data)
      .find((d) => d.productId === 'prod-1')
    expect(productItem).toMatchObject({ quantity: 5, unitPrice: 10000, total: 50000 })
  })

  it('giảm số lượng: hoàn kho phần chênh lệch, dòng vẫn còn trên hoá đơn', async () => {
    const result = await checkoutWith([{ productId: 'prod-1', quantity: 1 }])
    expect(result.ok).toBe(true)

    // Hoàn kho 1 (2 → 1), KHÔNG hoàn kho phần đã bán trước đó
    expect(fakeStore.stockMovement.create.mock.calls[0][0].data).toMatchObject({
      type: 'VOID',
      quantity: 1,
    })

    const productItem = fakeStore.invoiceItem.create.mock.calls
      .map((c) => c[0].data)
      .find((d) => d.productId === 'prod-1')
    expect(productItem).toMatchObject({ quantity: 1, unitPrice: 10000 })
  })

  it('bỏ hẳn dòng khỏi phiếu: hoàn kho toàn bộ số lượng đã bán kèm, không tạo dòng hoá đơn', async () => {
    const result = await checkoutWith([])
    expect(result.ok).toBe(true)

    expect(fakeStore.stockMovement.create.mock.calls[0][0].data).toMatchObject({
      type: 'VOID',
      quantity: 2,
    })
    const productItems = fakeStore.invoiceItem.create.mock.calls
      .map((c) => c[0].data)
      .filter((d) => d.productId === 'prod-1')
    expect(productItems).toHaveLength(0)

    // Dòng bán kèm vẫn bị xoá khỏi phiên
    expect(fakeStore.sessionSellItem.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['ssi-1'] } },
    })
  })

  it('tăng vượt tồn thì chặn cả hoá đơn, không âm kho', async () => {
    fakeStore.product.updateMany.mockResolvedValue({ count: 0 }) // trừ kho thất bại
    const result = await checkoutWith([{ productId: 'prod-1', quantity: 5 }])

    // Hoá đơn đã được tạo trước bước trừ kho nhưng cùng transaction nên bị
    // rollback — điều runInTransaction đảm bảo, fake store không mô phỏng rollback.
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('INSUFFICIENT_STOCK')
  })
})
