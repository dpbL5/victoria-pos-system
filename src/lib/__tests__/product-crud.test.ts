import { describe, it, expect, vi, beforeEach } from 'vitest'

const fakeStore = vi.hoisted(() => ({
  session: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
  sessionPricingGroup: { create: vi.fn(), update: vi.fn(), findMany: vi.fn() },
  shift: { findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
  shiftParticipant: { create: vi.fn() },
  product: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn(), create: vi.fn(), delete: vi.fn() },
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

import { createProduct, applyStockMovement, deleteProduct, mapDeleteProductError } from '@/lib/sessions/use-cases/product-crud'
import { createRepositories } from '@/lib/infrastructure/repositories'

const repos = createRepositories(fakeStore as never)

function resetMocks() {
  vi.clearAllMocks()

  fakeStore.product.create.mockResolvedValue({
    id: 'prod-1', name: 'Nước suối', sku: 'NUOC-1', type: 'PRODUCT', price: 10000,
    costPrice: 5000, stockQuantity: 20, minStockLevel: 5, isActive: true,
    createdAt: new Date(), updatedAt: new Date(),
  })
  fakeStore.product.findUnique.mockResolvedValue({
    id: 'prod-1', name: 'Nước suối', sku: 'NUOC-1', type: 'PRODUCT', price: 10000,
    costPrice: 5000, stockQuantity: 20, minStockLevel: 5, isActive: true,
    createdAt: new Date(), updatedAt: new Date(),
  })
}

describe('createProduct', () => {
  beforeEach(resetMocks)

  it('tạo PRODUCT với tồn đầu kỳ + stock movement RESTOCK + audit', async () => {
    const result = await createProduct({
      staffId: 'staff-1', name: 'Nước suối', sku: 'NUOC-1', type: 'PRODUCT', price: 10000,
      costPrice: 5000, stockQuantity: 20, minStockLevel: 5, isActive: true,
    }, repos)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.product).toMatchObject({ id: 'prod-1', type: 'PRODUCT', stockQuantity: 20 })

    const createCall = fakeStore.product.create.mock.calls[0][0]
    expect(createCall.data).toMatchObject({ name: 'Nước suối', type: 'PRODUCT', stockQuantity: 20 })

    // Stock movement RESTOCK tồn đầu kỳ
    expect(fakeStore.stockMovement.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ type: 'RESTOCK', quantity: 20 }),
    }))
    expect(fakeStore.activityLog.create).toHaveBeenCalled()
  })

  it('tạo SERVICE với stock 0 và không tạo stock movement', async () => {
    fakeStore.product.create.mockResolvedValue({
      id: 'prod-svc', name: 'Cho thuê ván', sku: null, type: 'SERVICE', price: 50000,
      costPrice: null, stockQuantity: 0, minStockLevel: 0, isActive: true,
      createdAt: new Date(), updatedAt: new Date(),
    })
    const result = await createProduct({
      staffId: 'staff-1', name: 'Cho thuê ván', sku: null, type: 'SERVICE', price: 50000,
      costPrice: null, stockQuantity: 0, minStockLevel: 0, isActive: true,
    }, repos)

    expect(result.ok).toBe(true)
    if (!result.ok) return

    const createCall = fakeStore.product.create.mock.calls[0][0]
    expect(createCall.data).toMatchObject({ type: 'SERVICE', stockQuantity: 0, minStockLevel: 0 })
    // SERVICE không tạo stock movement
    expect(fakeStore.stockMovement.create).not.toHaveBeenCalled()
  })
})

describe('applyStockMovement', () => {
  beforeEach(resetMocks)

  it('RESTOCK dương làm tăng tồn + ghi movement + audit', async () => {
    fakeStore.product.findUnique.mockResolvedValue({
      id: 'prod-1', name: 'Nước suối', sku: 'NUOC-1', type: 'PRODUCT', price: 10000,
      costPrice: 5000, stockQuantity: 20, minStockLevel: 5, isActive: true,
      createdAt: new Date(), updatedAt: new Date(),
    })
    // Adapter applyStockMovement: stockMovement.create → { id } rồi product.update → stockQuantity mới
    fakeStore.stockMovement.create.mockResolvedValue({ id: 'mv-1', productId: 'prod-1', type: 'RESTOCK', quantity: 10 })
    fakeStore.product.update.mockResolvedValue({
      id: 'prod-1', name: 'Nước suối', sku: 'NUOC-1', type: 'PRODUCT', price: 10000,
      costPrice: 5000, stockQuantity: 30, minStockLevel: 5, isActive: true,
      createdAt: new Date(), updatedAt: new Date(),
    })

    const result = await applyStockMovement({
      productId: 'prod-1', staffId: 'staff-1', type: 'RESTOCK', quantity: 10,
      unitCost: 5000, reason: 'Nhập thêm', shiftId: 'shift-1',
    }, repos)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toMatchObject({ movementId: 'mv-1', before: 20, after: 30, type: 'RESTOCK' })
    // stock movement ghi vào store
    expect(fakeStore.stockMovement.create).toHaveBeenCalled()
    expect(fakeStore.activityLog.create).toHaveBeenCalled()
  })

  it('trả NEGATIVE_STOCK khi tồn không được âm', async () => {
    fakeStore.product.findUnique.mockResolvedValue({
      id: 'prod-1', name: 'Nước suối', sku: 'NUOC-1', type: 'PRODUCT', price: 10000,
      costPrice: 5000, stockQuantity: 5, minStockLevel: 5, isActive: true,
      createdAt: new Date(), updatedAt: new Date(),
    })
    const result = await applyStockMovement({
      productId: 'prod-1', staffId: 'staff-1', type: 'ADJUSTMENT', quantity: -10,
      unitCost: null, reason: 'Kiểm kho', shiftId: 'shift-1',
    }, repos)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('NEGATIVE_STOCK')
    expect(fakeStore.stockMovement.create).not.toHaveBeenCalled()
  })

  it('trả SERVICE_HAS_NO_STOCK khi điều chỉnh tồn cho SERVICE', async () => {
    fakeStore.product.findUnique.mockResolvedValue({
      id: 'prod-svc', name: 'Cho thuê ván', sku: null, type: 'SERVICE', price: 50000,
      costPrice: null, stockQuantity: 0, minStockLevel: 0, isActive: true,
      createdAt: new Date(), updatedAt: new Date(),
    })
    const result = await applyStockMovement({
      productId: 'prod-svc', staffId: 'staff-1', type: 'RESTOCK', quantity: 5,
      unitCost: null, reason: 'test', shiftId: null,
    }, repos)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('SERVICE_HAS_NO_STOCK')
  })

  it('trả PRODUCT_NOT_FOUND khi hàng không tồn tại', async () => {
    fakeStore.product.findUnique.mockResolvedValue(null)
    const result = await applyStockMovement({
      productId: 'missing', staffId: 'staff-1', type: 'RESTOCK', quantity: 5,
      unitCost: null, reason: 'test', shiftId: null,
    }, repos)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('PRODUCT_NOT_FOUND')
  })
})

describe('deleteProduct', () => {
  beforeEach(resetMocks)

  it('xoá cứng khi chưa có giao dịch', async () => {
    fakeStore.product.findUnique
      .mockResolvedValueOnce({
        id: 'prod-1', name: 'Nước suối', sku: 'NUOC-1', type: 'PRODUCT', price: 10000,
        costPrice: 5000, stockQuantity: 0, minStockLevel: 5, isActive: true,
        createdAt: new Date(), updatedAt: new Date(),
      })
      .mockResolvedValueOnce({
        _count: { stockMovements: 0, invoiceItems: 0, sellItems: 0 },
      })

    const result = await deleteProduct({ staffId: 'staff-1', productId: 'prod-1' }, repos)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.deleted).toBe(true)
    expect(result.value.deactivated).toBeNull()
    expect(fakeStore.product.delete).toHaveBeenCalledWith({ where: { id: 'prod-1' } })
    expect(fakeStore.activityLog.create).toHaveBeenCalled()
  })

  it('deactivate khi đã có giao dịch (ngưng bán, giữ lịch sử)', async () => {
    fakeStore.product.findUnique
      .mockResolvedValueOnce({
        id: 'prod-1', name: 'Nước suối', sku: 'NUOC-1', type: 'PRODUCT', price: 10000,
        costPrice: 5000, stockQuantity: 20, minStockLevel: 5, isActive: true,
        createdAt: new Date(), updatedAt: new Date(),
      })
      .mockResolvedValueOnce({
        _count: { stockMovements: 2, invoiceItems: 1, sellItems: 0 },
      })

    const result = await deleteProduct({ staffId: 'staff-1', productId: 'prod-1' }, repos)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.deleted).toBe(false)
    expect(result.value.deactivated).not.toBeNull()
    expect(fakeStore.product.update).toHaveBeenCalledWith({ where: { id: 'prod-1' }, data: { isActive: false } })
    expect(fakeStore.product.delete).not.toHaveBeenCalled()
    const auditCall = fakeStore.activityLog.create.mock.calls[0][0]
    expect(auditCall.data.action).toBe('PRODUCT_DEACTIVATE')
  })

  it('trả PRODUCT_NOT_FOUND khi hàng không tồn tại', async () => {
    fakeStore.product.findUnique.mockResolvedValue(null)
    const result = await deleteProduct({ staffId: 'staff-1', productId: 'missing' }, repos)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('PRODUCT_NOT_FOUND')
    expect(fakeStore.product.delete).not.toHaveBeenCalled()
    expect(fakeStore.product.update).not.toHaveBeenCalled()
  })

  it('mapDeleteProductError mapping đúng status', () => {
    expect(mapDeleteProductError({ code: 'PRODUCT_NOT_FOUND' } as never)).toMatchObject({ status: 404 })
  })
})
