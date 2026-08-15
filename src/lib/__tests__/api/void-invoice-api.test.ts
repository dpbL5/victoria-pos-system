import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Integration API test: POST /api/invoices/[id]/void ──
// Mock prisma (fake store) + auth. Kiểm tra hợp đồng HTTP + admin gate.

const fakeStore = vi.hoisted(() => {
  const store = {
    shift: { findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
    shiftParticipant: { findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn(), upsert: vi.fn() },
    membershipPlan: { findUnique: vi.fn(), findMany: vi.fn() },
    customer: { create: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn(), findMany: vi.fn() },
    membership: { create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
    session: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    sessionPricingGroup: { findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    invoice: { create: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn(), delete: vi.fn() },
    invoiceItem: { create: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn() },
    payment: { create: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn(), count: vi.fn() },
    stockMovement: { create: vi.fn(), findMany: vi.fn() },
    product: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
    activityLog: { create: vi.fn(), findMany: vi.fn() },
    pricingRule: { findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
    pricingTier: { findMany: vi.fn(), create: vi.fn() },
    promotionRule: { findUnique: vi.fn(), findMany: vi.fn() },
    appSetting: { findUnique: vi.fn(), upsert: vi.fn(), findMany: vi.fn() },
    tool: { findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    shiftTool: { findUnique: vi.fn(), upsert: vi.fn() },
    cashflowEntry: { create: vi.fn(), update: vi.fn(), delete: vi.fn(), findMany: vi.fn() },
    user: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
  }
  return {
    ...store,
    $transaction: (work: (tx: unknown) => Promise<unknown>) => work(store),
  }
})

vi.mock('@/lib/infrastructure/prisma', () => ({ prisma: fakeStore }))

let mockRole = 'ADMIN'
vi.mock('@/lib/shared/auth', () => ({
  requireAuth: vi.fn(async () => ({ userId: 'staff-1', username: 'nv_a', fullName: 'Nhân viên A', role: mockRole })),
  requireAdmin: vi.fn(async () => {
    if (mockRole !== 'ADMIN') throw new Error('FORBIDDEN')
    return { userId: 'staff-1', username: 'nv_a', fullName: 'Nhân viên A', role: 'ADMIN' }
  }),
  requireMutationAuth: vi.fn(async () => ({ userId: 'staff-1', username: 'nv_a', fullName: 'Nhân viên A', role: mockRole })),
}))

import { POST as voidHandler } from '@/app/api/invoices/[id]/void/route'
import { invoke } from '../helpers/api-test'

const INVOICE_ID = '55555555-5555-4555-8555-555555555555'

const paidInvoice = {
  id: INVOICE_ID,
  invoiceNo: 'INV-20260807-0001',
  grandTotal: 150000,
  status: 'PAID',
  notes: null,
  shiftId: 'shift-1',
  sessionId: null,
  items: [],
  staff: { fullName: 'Nhân viên A' },
}

function resetMocks() {
  mockRole = 'ADMIN'
  vi.clearAllMocks()
  fakeStore.invoice.findUnique.mockResolvedValue(paidInvoice)
  fakeStore.invoice.findMany.mockResolvedValue([]) // không có DRAFT merged
}

describe('POST /api/invoices/[id]/void', () => {
  beforeEach(resetMocks)

  it('trả 400 VALIDATION khi ID không phải UUID', async () => {
    const { status, json } = await invoke(voidHandler, { params: { id: 'not-a-uuid' }, body: {} })
    expect(status).toBe(400)
    expect(json.code).toBe('VALIDATION')
  })

  it('trả 403 FORBIDDEN khi STAFF (không phải admin)', async () => {
    mockRole = 'STAFF'
    const { status, json } = await invoke(voidHandler, { params: { id: INVOICE_ID }, body: {} })
    expect(status).toBe(403)
    expect(json.code).toBe('FORBIDDEN')
  })

  it('trả 200 khi huỷ hoá đơn PAID thành công', async () => {
    const { status, json } = await invoke(voidHandler, { params: { id: INVOICE_ID }, body: { reason: 'Ghi nhầm' } })
    expect(status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.message).toBe('Đã huỷ hoá đơn')
  })

  it('trả 409 INVOICE_NOT_VOIDABLE khi hoá đơn chưa PAID', async () => {
    fakeStore.invoice.findUnique.mockResolvedValue({ ...paidInvoice, status: 'DRAFT' })
    const { status, json } = await invoke(voidHandler, { params: { id: INVOICE_ID }, body: {} })
    expect(status).toBe(409)
    expect(json.code).toBe('INVOICE_NOT_VOIDABLE')
  })
})
