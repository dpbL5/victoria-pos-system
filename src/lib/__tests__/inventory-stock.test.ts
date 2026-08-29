import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock prisma singleton (Pattern B) — applyStockMovement đi qua real adapters với fake store.
const fakeStore = vi.hoisted(() => ({
  product: { findUnique: vi.fn(), update: vi.fn() },
  stockMovement: { create: vi.fn() },
  activityLog: { create: vi.fn() },
}))

vi.mock('@/lib/infrastructure/prisma', () => ({
  prisma: { $transaction: (work: (store: unknown) => Promise<unknown>) => work(fakeStore) },
}))

import { applyStockMovement } from '@/lib/sessions/use-cases/product-crud'
import { createRepositories } from '@/lib/infrastructure/repositories'

const repos = createRepositories(fakeStore as never)

const product = {
  id: 'prod-1',
  name: 'Nước suối',
  type: 'PRODUCT',
  price: 15000,
  stockQuantity: 10,
  minStockLevel: 2,
  isActive: true,
}

const input = {
  productId: 'prod-1',
  staffId: 'staff-1',
  type: 'RESTOCK' as const,
  quantity: 5,
  reason: 'Nhập kho',
  shiftId: null,
}

function resetMocks() {
  vi.clearAllMocks()
  fakeStore.product.findUnique.mockResolvedValue(product)
  fakeStore.stockMovement.create.mockResolvedValue({ id: 'sm-1', type: 'RESTOCK', quantity: 5 })
  fakeStore.product.update.mockResolvedValue({ ...product, stockQuantity: 15 })
}

describe('applyStockMovement', () => {
  beforeEach(resetMocks)

  it('trả PRODUCT_NOT_FOUND khi sản phẩm không tồn tại', async () => {
    fakeStore.product.findUnique.mockResolvedValue(null)
    const result = await applyStockMovement(input, repos)
    expect(result).toEqual({ ok: false, error: { code: 'PRODUCT_NOT_FOUND' } })
  })

  it('trả SERVICE_HAS_NO_STOCK khi là dịch vụ', async () => {
    fakeStore.product.findUnique.mockResolvedValue({ ...product, type: 'SERVICE' })
    const result = await applyStockMovement(input, repos)
    expect(result).toEqual({ ok: false, error: { code: 'SERVICE_HAS_NO_STOCK' } })
  })

  it('trả NEGATIVE_STOCK khi ADJUSTMENT làm tồn kho âm', async () => {
    const result = await applyStockMovement(
      { ...input, type: 'ADJUSTMENT', quantity: -11 },
      repos
    )
    expect(result).toEqual({ ok: false, error: { code: 'NEGATIVE_STOCK' } })
  })

  it('RESTOCK thành công: tạo StockMovement + cập nhật tồn + ghi audit', async () => {
    const result = await applyStockMovement(input, repos)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.after).toBe(15)
    expect(result.value.type).toBe('RESTOCK')

    // Ghi StockMovement
    expect(fakeStore.stockMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        productId: 'prod-1',
        type: 'RESTOCK',
        quantity: 5,
      }),
    })
    // Cập nhật stockQuantity
    expect(fakeStore.product.update).toHaveBeenCalledWith({
      where: { id: 'prod-1' },
      data: expect.objectContaining({ stockQuantity: 15 }),
    })
    // Ghi audit STOCK_MOVEMENT
    const auditData = fakeStore.activityLog.create.mock.calls[0][0].data
    expect(auditData.action).toBe('STOCK_MOVEMENT')
    expect(auditData.entityId).toBe('prod-1')
  })

  it('ADJUSTMENT âm hợp lệ (không âm) thành công', async () => {
    fakeStore.product.update.mockResolvedValue({ ...product, stockQuantity: 7 })
    // stockMovement.create trả movement với type theo input thực tế
    fakeStore.stockMovement.create.mockImplementation(async (args: { data: { type: string; quantity: number } }) => ({
      id: 'sm-2', type: args.data.type, quantity: args.data.quantity,
    }))
    const result = await applyStockMovement(
      { ...input, type: 'ADJUSTMENT', quantity: -3 },
      repos
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.after).toBe(7)
    expect(result.value.type).toBe('ADJUSTMENT')
  })
})
