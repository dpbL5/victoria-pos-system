import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock prisma singleton (Pattern B) — adapter đọc qua store giả.
const fakeStore = vi.hoisted(() => ({
  product: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
  },
  stockMovement: { create: vi.fn(), findMany: vi.fn() },
}))

vi.mock('@/lib/infrastructure/prisma', () => ({
  prisma: { $transaction: (work: (store: unknown) => Promise<unknown>) => work(fakeStore) },
}))

import { createRepositories } from '@/lib/infrastructure/repositories'

const repos = createRepositories(fakeStore as never)

const CREATED_AT = new Date('2026-10-21T03:00:00.000Z')

function movement(overrides: Record<string, unknown> = {}) {
  return {
    id: 'mv-1',
    type: 'SALE',
    quantity: -2,
    reason: 'Bán kèm phiên sess-1',
    createdAt: CREATED_AT,
    product: { id: 'prod-1', name: 'Nước suối', sku: 'NUOC-1' },
    staff: { fullName: 'Nhân viên A' },
    invoiceItem: { invoice: { invoiceNo: 'INV-001', sessionId: 'sess-1' } },
    ...overrides,
  }
}

describe('findStockMovements', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fakeStore.stockMovement.findMany.mockResolvedValue([])
  })

  it('đọc biến động mới nhất trước, có tên hàng và nhân viên', async () => {
    fakeStore.stockMovement.findMany.mockResolvedValue([movement()])

    const rows = await repos.product.findStockMovements({})

    expect(fakeStore.stockMovement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: 'desc' }, take: 200 }),
    )
    expect(rows[0]).toMatchObject({
      id: 'mv-1',
      type: 'SALE',
      quantity: -2,
      productName: 'Nước suối',
      productSku: 'NUOC-1',
      staffName: 'Nhân viên A',
      invoiceNo: 'INV-001',
      createdAt: '2026-10-21T03:00:00.000Z',
    })
  })

  it('lọc theo loại biến động', async () => {
    await repos.product.findStockMovements({ type: 'RESTOCK' })

    expect(fakeStore.stockMovement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { type: 'RESTOCK' } }),
    )
  })

  it('bán lẻ: hoá đơn không gắn phiên', async () => {
    fakeStore.stockMovement.findMany.mockResolvedValue([
      movement({ invoiceItem: { invoice: { invoiceNo: 'INV-002', sessionId: null } } }),
    ])

    const rows = await repos.product.findStockMovements({})

    expect(rows[0].channel).toBe('RETAIL')
  })

  it('bán kèm: hoá đơn gắn phiên chơi', async () => {
    fakeStore.stockMovement.findMany.mockResolvedValue([movement()])

    const rows = await repos.product.findStockMovements({})

    expect(rows[0].channel).toBe('SESSION')
  })

  it('bán kèm ghi tạm trong phiên (chưa checkout) vẫn là bán kèm', async () => {
    fakeStore.stockMovement.findMany.mockResolvedValue([movement({ invoiceItem: null })])

    const rows = await repos.product.findStockMovements({})

    expect(rows[0].channel).toBe('SESSION')
    expect(rows[0].invoiceNo).toBeNull()
  })

  it('nhập kho / điều chỉnh không có kênh bán', async () => {
    fakeStore.stockMovement.findMany.mockResolvedValue([
      movement({ type: 'RESTOCK', quantity: 10, invoiceItem: null }),
    ])

    const rows = await repos.product.findStockMovements({})

    expect(rows[0].channel).toBeNull()
  })
})
