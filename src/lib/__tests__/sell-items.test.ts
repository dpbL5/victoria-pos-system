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

import { sellItems, removeSellItems, syncSessionSellItems } from '@/lib/sessions/use-cases/sell-items'
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
    { id: 'prod-1', name: 'Nước suối', type: 'PRODUCT', price: 10000, stockQuantity: 10, isActive: true },
  ])
  fakeStore.product.findUnique.mockResolvedValue({
    id: 'prod-1', name: 'Nước suối', type: 'PRODUCT', price: 10000, stockQuantity: 10, isActive: true,
  })

  // SessionSellItem chưa có dòng nào (chưa bán kèm)
  fakeStore.sessionSellItem.findMany.mockResolvedValue([])
  fakeStore.sessionSellItem.findFirst.mockResolvedValue(null)
  fakeStore.sessionSellItem.create.mockResolvedValue({ id: 'ssi-1' })
  fakeStore.sessionSellItem.update.mockResolvedValue({ id: 'ssi-1' })
  fakeStore.sessionSellItem.deleteMany.mockResolvedValue({ count: 1 })

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

  it('ghi SessionSellItem + trừ kho + ghi audit trong 1 transaction (không tạo invoice)', async () => {
    const result = await sellItems(input, repos)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toMatchObject({ sessionId: 'sess-1', itemCount: 1, grandTotal: 20000 })

    // Không tạo invoice nào
    expect(fakeStore.invoice.create).not.toHaveBeenCalled()

    // Ghi dòng bán kèm tạm
    const sellCall = fakeStore.sessionSellItem.create.mock.calls[0][0]
    expect(sellCall.data).toMatchObject({
      sessionId: 'sess-1',
      productId: 'prod-1',
      quantity: 2,
      unitPrice: 10000,
    })

    // Trừ kho 2 nước suối
    expect(fakeStore.product.updateMany).toHaveBeenCalledWith({
      where: { id: 'prod-1', stockQuantity: { gte: 2 } },
      data: { stockQuantity: { decrement: 2 } },
    })

    // Ghi stock movement SALE (không gắn invoiceItemId)
    const movementCall = fakeStore.stockMovement.create.mock.calls[0][0]
    expect(movementCall.data).toMatchObject({ type: 'SALE', quantity: -2, productId: 'prod-1', invoiceItemId: null })

    expect(fakeStore.activityLog.create).toHaveBeenCalled()
  })

  it('upsert theo productId khi bán kèm trùng sản phẩm (cộng quantity)', async () => {
    fakeStore.sessionSellItem.findFirst.mockResolvedValue({ id: 'ssi-1' })
    const result = await sellItems(input, repos)
    expect(result.ok).toBe(true)
    // Không tạo mới — update increment
    expect(fakeStore.sessionSellItem.create).not.toHaveBeenCalled()
    expect(fakeStore.sessionSellItem.update).toHaveBeenCalled()
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

describe('removeSellItems', () => {
  beforeEach(resetMocks)

  it('xoá dòng bán kèm + hoàn kho + ghi audit', async () => {
    fakeStore.sessionSellItem.findMany.mockResolvedValue([
      {
        id: 'ssi-1',
        sessionId: 'sess-1',
        productId: 'prod-1',
        quantity: 2,
        unitPrice: 10000,
        notes: null,
        createdAt: new Date(),
      },
    ])
    const result = await removeSellItems({ sessionId: 'sess-1', staffId: 'staff-1', itemIds: ['ssi-1'] }, repos)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toEqual({ removedCount: 1 })

    // Xoá đúng dòng
    expect(fakeStore.sessionSellItem.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['ssi-1'] } },
    })

    // Hoàn kho qua reverseStock (stockMovement VOID + product.update increment)
    const voidCall = fakeStore.stockMovement.create.mock.calls[0][0]
    expect(voidCall.data).toMatchObject({ type: 'VOID', quantity: 2, productId: 'prod-1', invoiceItemId: null })

    expect(fakeStore.activityLog.create).toHaveBeenCalled()
  })

  it('trả SELL_ITEM_NOT_FOUND khi dòng không thuộc phiên', async () => {
    fakeStore.sessionSellItem.findMany.mockResolvedValue([])
    const result = await removeSellItems({ sessionId: 'sess-1', staffId: 'staff-1', itemIds: ['ssi-x'] }, repos)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('SELL_ITEM_NOT_FOUND')
  })
})

// Đường ghi khi nhân viên sửa hàng hoá trong màn thu tiền rồi đóng màn đó:
// đặt danh sách hàng chờ thu đúng bằng danh sách gửi lên, bù kho theo chênh lệch.
describe('syncSessionSellItems', () => {
  const existingRow = (overrides: Partial<Record<string, unknown>> = {}) => ({
    id: 'ssi-1',
    sessionId: 'sess-1',
    productId: 'prod-1',
    quantity: 2,
    unitPrice: 10000,
    notes: null,
    createdAt: new Date('2026-08-07T11:00:00'),
    ...overrides,
  })

  beforeEach(() => {
    resetMocks()
    fakeStore.sessionSellItem.findMany.mockResolvedValue([existingRow()])
  })

  it('tăng số lượng: trừ kho đúng phần chênh lệch, giữ giá đã chốt', async () => {
    const result = await syncSessionSellItems(
      { sessionId: 'sess-1', staffId: 'staff-1', items: [{ productId: 'prod-1', quantity: 5 }] },
      repos,
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.itemCount).toBe(1)
    expect(result.value.grandTotal).toBe(50000)

    expect(fakeStore.product.updateMany).toHaveBeenCalledWith({
      where: { id: 'prod-1', stockQuantity: { gte: 3 } },
      data: { stockQuantity: { decrement: 3 } },
    })
    // Chỉ đổi quantity, KHÔNG gửi unitPrice lên DB
    expect(fakeStore.sessionSellItem.update).toHaveBeenCalledWith({
      where: { id: 'ssi-1' },
      data: { quantity: 5 },
    })
    expect(fakeStore.activityLog.create.mock.calls[0][0].data).toMatchObject({
      action: 'SESSION_SELL_SYNC',
    })
  })

  it('không đổi gì: không ghi DB, không gọi API kho', async () => {
    const result = await syncSessionSellItems(
      { sessionId: 'sess-1', staffId: 'staff-1', items: [{ productId: 'prod-1', quantity: 2 }] },
      repos,
    )

    expect(result.ok).toBe(true)
    expect(fakeStore.sessionSellItem.update).not.toHaveBeenCalled()
    expect(fakeStore.sessionSellItem.deleteMany).not.toHaveBeenCalled()
    expect(fakeStore.product.updateMany).not.toHaveBeenCalled()
    expect(fakeStore.stockMovement.create).not.toHaveBeenCalled()
  })

  it('giảm số lượng: hoàn kho phần lệch, dòng vẫn còn', async () => {
    const result = await syncSessionSellItems(
      { sessionId: 'sess-1', staffId: 'staff-1', items: [{ productId: 'prod-1', quantity: 1 }] },
      repos,
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.grandTotal).toBe(10000)
    expect(fakeStore.stockMovement.create.mock.calls[0][0].data).toMatchObject({
      type: 'VOID',
      quantity: 1,
    })
    expect(fakeStore.sessionSellItem.deleteMany).not.toHaveBeenCalled()
  })

  it('danh sách rỗng: bỏ hết dòng của phiên và hoàn kho toàn bộ', async () => {
    const result = await syncSessionSellItems(
      { sessionId: 'sess-1', staffId: 'staff-1', items: [] },
      repos,
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.itemCount).toBe(0)
    expect(result.value.grandTotal).toBe(0)
    expect(fakeStore.sessionSellItem.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['ssi-1'] } } })
    expect(fakeStore.stockMovement.create.mock.calls[0][0].data).toMatchObject({ type: 'VOID', quantity: 2 })
  })

  it('hàng mới chọn lúc thu: tạo dòng bán kèm + trừ kho theo giá hiện tại', async () => {
    fakeStore.sessionSellItem.findMany.mockResolvedValue([])
    const result = await syncSessionSellItems(
      { sessionId: 'sess-1', staffId: 'staff-1', items: [{ productId: 'prod-1', quantity: 3 }] },
      repos,
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.grandTotal).toBe(30000)
    expect(fakeStore.sessionSellItem.create).toHaveBeenCalled()
    expect(fakeStore.stockMovement.create.mock.calls[0][0].data).toMatchObject({
      type: 'SALE',
      quantity: -3,
    })
  })

  it('trả SESSION_NOT_FOUND khi phiên không tồn tại', async () => {
    fakeStore.session.findUnique.mockResolvedValue(null)
    const result = await syncSessionSellItems(
      { sessionId: 'sess-1', staffId: 'staff-1', items: [] },
      repos,
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('SESSION_NOT_FOUND')
  })

  it('trả INSUFFICIENT_STOCK khi tăng vượt tồn và không sửa dòng', async () => {
    fakeStore.product.updateMany.mockResolvedValue({ count: 0 })
    const result = await syncSessionSellItems(
      { sessionId: 'sess-1', staffId: 'staff-1', items: [{ productId: 'prod-1', quantity: 9 }] },
      repos,
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('INSUFFICIENT_STOCK')
    expect(fakeStore.sessionSellItem.update).not.toHaveBeenCalled()
  })
})
