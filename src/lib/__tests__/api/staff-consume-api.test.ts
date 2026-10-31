import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Integration API test: POST /api/products/[id]/consume ──
// Nhân viên nhận hàng nội bộ: trừ 1 tồn kho (ADJUSTMENT -1) và ghi lý do theo tên nhân viên.

const fakeStore = vi.hoisted(() => {
  const store = {
    shift: { findFirst: vi.fn(), findUnique: vi.fn() },
    product: { findUnique: vi.fn(), update: vi.fn() },
    stockMovement: { create: vi.fn() },
    activityLog: { create: vi.fn() },
  }
  return {
    ...store,
    $transaction: (work: (tx: unknown) => Promise<unknown>) => work(store),
  }
})

vi.mock('@/lib/infrastructure/prisma', () => ({ prisma: fakeStore }))

let mockRole = 'STAFF'
vi.mock('@/lib/shared/auth', () => ({
  requireMutationAuth: vi.fn(async () => ({
    userId: 'staff-1',
    username: 'nv_a',
    fullName: 'Nhân viên A',
    role: mockRole,
  })),
}))

import { POST } from '@/app/api/products/[id]/consume/route'
import { invoke } from '../helpers/api-test'

const PRODUCT_ID = '55555555-5555-4555-8555-555555555555'
const product = {
  id: PRODUCT_ID,
  name: 'Nước suối',
  type: 'PRODUCT',
  price: 10000,
  stockQuantity: 5,
  minStockLevel: 0,
  isActive: true,
}

beforeEach(() => {
  mockRole = 'STAFF'
  vi.clearAllMocks()
  fakeStore.shift.findFirst.mockResolvedValue({ id: 'shift-1' })
  fakeStore.product.findUnique.mockResolvedValue(product)
  fakeStore.product.update.mockResolvedValue({ ...product, stockQuantity: product.stockQuantity - 1 })
  fakeStore.stockMovement.create.mockResolvedValue({
    id: 'movement-1',
    type: 'ADJUSTMENT',
    quantity: -1,
    shiftId: 'shift-1',
  })
})

describe('POST /api/products/[id]/consume', () => {
  it('trừ 1 đơn vị tồn kho với lý do theo tên nhân viên', async () => {
    const { status, json } = await invoke(POST, { params: { id: PRODUCT_ID }, body: {} })

    expect(status).toBe(200)
    expect(json.success).toBe(true)
    expect(fakeStore.stockMovement.create).toHaveBeenCalledWith({
      data: {
        productId: PRODUCT_ID,
        shiftId: 'shift-1',
        staffId: 'staff-1',
        type: 'ADJUSTMENT',
        quantity: -1,
        reason: 'Nhân viên A lấy nước uống',
      },
    })
    expect(fakeStore.product.update).toHaveBeenCalledWith({
      where: { id: PRODUCT_ID },
      data: { stockQuantity: 4 },
    })
  })

  it('trả 403 FORBIDDEN với TEACHER', async () => {
    mockRole = 'TEACHER'
    const { status, json } = await invoke(POST, { params: { id: PRODUCT_ID }, body: {} })

    expect(status).toBe(403)
    expect(json.code).toBe('FORBIDDEN')
    expect(fakeStore.stockMovement.create).not.toHaveBeenCalled()
  })
})
