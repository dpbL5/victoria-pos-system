import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Integration API test: /api/staff-consumption ──
// Nhân viên nhận nước: tối đa 1 lần/ngày (giờ VN), trừ kho ADJUSTMENT -1.

const fakeStore = vi.hoisted(() => {
  const store = {
    shift: { findFirst: vi.fn(), findUnique: vi.fn() },
    product: { findUnique: vi.fn(), update: vi.fn() },
    stockMovement: { create: vi.fn(), findMany: vi.fn() },
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
  // TEACHER không có quyền quầy — userHasPermission trả false
  requireAuth: vi.fn(async () => ({
    userId: 'staff-1',
    username: 'nv_a',
    fullName: 'Nhân viên A',
    role: mockRole === 'STAFF'
      ? { id: 'role-1', key: null, name: 'Nhân viên', locked: false, permissions: ['sessions.view'] }
      : null,
  })),
  userHasPermission: vi.fn((user: { role: { permissions: string[] } | null } | null, ...keys: string[]) =>
    !!user?.role && keys.some((k) => user.role!.permissions.includes(k))),
  requireMutationAuth: vi.fn(async () => ({
    userId: 'staff-1',
    username: 'nv_a',
    fullName: 'Nhân viên A',
    role: mockRole === 'STAFF'
      ? { id: 'role-1', key: null, name: 'Nhân viên', locked: false, permissions: ['sessions.view'] }
      : null,
  })),
}))

import { GET, POST } from '@/app/api/staff-consumption/route'
import { hasReceivedStaffDrinkToday } from '@/lib/sessions'
import { parseStartOfDay } from '@/lib/shared/utils'
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

const drinkMovement = {
  id: 'movement-0',
  type: 'ADJUSTMENT',
  quantity: -1,
  reason: 'Nhân viên A lấy nước uống',
  createdAt: new Date(),
  product: { id: PRODUCT_ID, name: 'Nước suối', sku: null },
  staff: { fullName: 'Nhân viên A' },
  invoiceItem: null,
}

beforeEach(() => {
  mockRole = 'STAFF'
  vi.clearAllMocks()
  fakeStore.shift.findFirst.mockResolvedValue({ id: 'shift-1' })
  fakeStore.product.findUnique.mockResolvedValue(product)
  fakeStore.product.update.mockResolvedValue({ ...product, stockQuantity: product.stockQuantity - 1 })
  fakeStore.stockMovement.findMany.mockResolvedValue([])
  fakeStore.stockMovement.create.mockResolvedValue({
    id: 'movement-1',
    type: 'ADJUSTMENT',
    quantity: -1,
    shiftId: 'shift-1',
  })
})

describe('POST /api/staff-consumption', () => {
  it('trừ 1 đơn vị tồn kho với lý do theo tên nhân viên', async () => {
    const { status, json } = await invoke(POST, { body: { productId: PRODUCT_ID } })

    expect(status).toBe(201)
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

  it('trả 409 ALREADY_RECEIVED_TODAY khi hôm nay đã nhận nước', async () => {
    fakeStore.stockMovement.findMany.mockResolvedValue([drinkMovement])

    const { status, json } = await invoke(POST, { body: { productId: PRODUCT_ID } })

    expect(status).toBe(409)
    expect(json.code).toBe('ALREADY_RECEIVED_TODAY')
    expect(fakeStore.stockMovement.create).not.toHaveBeenCalled()
  })

  it('trả 403 FORBIDDEN với TEACHER', async () => {
    mockRole = 'TEACHER'
    const { status, json } = await invoke(POST, { body: { productId: PRODUCT_ID } })

    expect(status).toBe(403)
    expect(json.code).toBe('FORBIDDEN')
    expect(fakeStore.stockMovement.create).not.toHaveBeenCalled()
  })
})

describe('GET /api/staff-consumption', () => {
  it('trả received=true khi hôm nay đã nhận nước', async () => {
    fakeStore.stockMovement.findMany.mockResolvedValue([drinkMovement])
    const json = await (await GET()).json()

    expect(json.success).toBe(true)
    expect(json.data).toEqual({ received: true })
  })

  it('trả received=false khi chưa nhận nước hôm nay', async () => {
    const json = await (await GET()).json()

    expect(json.data).toEqual({ received: false })
  })
})

describe('hasReceivedStaffDrinkToday', () => {
  it('tính mốc ngày theo giờ Việt Nam (UTC+7)', async () => {
    const findStockMovements = vi.fn().mockResolvedValue([])
    // 18:00 UTC ngày 31/10 = 01:00 ngày 01/11 giờ VN
    await hasReceivedStaffDrinkToday(
      'staff-1',
      { product: { findStockMovements } } as never,
      new Date('2026-10-31T18:00:00Z')
    )

    const from = parseStartOfDay('2026-11-01')
    expect(findStockMovements).toHaveBeenCalledWith(
      expect.objectContaining({
        staffId: 'staff-1',
        type: 'ADJUSTMENT',
        from,
        to: new Date(from.getTime() + 24 * 60 * 60 * 1000),
      })
    )
  })
})
