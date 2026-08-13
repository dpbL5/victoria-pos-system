import { describe, it, expect, vi } from 'vitest'
import { createReportingRepository } from '@/lib/infrastructure/adapters/reporting-adapter'
import type { ReportingStore } from '@/lib/reports/ports'

// ── Helpers ─────────────────────────────────────────────

function createReportingStore() {
  const invoiceItem = { findMany: vi.fn() }
  const product = { findMany: vi.fn() }
  const store = {
    invoiceItem,
    product,
    payment: {},
    session: {},
    customer: {},
    shift: {},
    invoice: {},
  } as unknown as ReportingStore
  return { store, invoiceItem, product }
}

function makeInvoiceItemRow(productId: string, quantity: number, total: number, unitCost: number | null) {
  return { productId, quantity, total, unitCost }
}

const from = new Date('2026-08-01T00:00:00.000Z')
const to = new Date('2026-08-31T23:59:59.999Z')

// ── getTopProducts ─────────────────────────────────────

describe('getTopProducts', () => {
  it('trả về danh sách rỗng khi không có bán hàng', async () => {
    const { store, invoiceItem } = createReportingStore()
    invoiceItem.findMany.mockResolvedValue([])

    const repo = createReportingRepository(store)
    const result = await repo.getTopProducts({ from, to, scope: 'ALL', staffId: 'staff-1' })

    expect(result.items).toEqual([])
    expect(invoiceItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          type: 'PRODUCT',
          productId: { not: null },
          invoice: expect.objectContaining({
            status: 'PAID',
            paidAt: { gte: from, lte: to },
          }),
        }),
      })
    )
  })

  it('chỉ tính type=PRODUCT, invoice PAID trong khoảng paidAt', async () => {
    const { store, invoiceItem, product } = createReportingStore()
    invoiceItem.findMany.mockResolvedValue([makeInvoiceItemRow('p1', 5, 100_000, 20_000)])
    product.findMany.mockResolvedValue([
      { id: 'p1', name: 'Nước suối', sku: 'NS-001', costPrice: 20_000 },
    ])

    const repo = createReportingRepository(store)
    const result = await repo.getTopProducts({ from, to, scope: 'ALL', staffId: 'staff-1' })

    expect(result.items).toEqual([
      {
        productId: 'p1',
        name: 'Nước suối',
        sku: 'NS-001',
        quantitySold: 5,
        revenue: 100_000,
        unitCost: 20_000,
        profit: 0, // 100_000 − 5 × 20_000
      },
    ])
  })

  it('scope STAFF lọc theo invoice.staffId', async () => {
    const { store, invoiceItem } = createReportingStore()
    invoiceItem.findMany.mockResolvedValue([])

    const repo = createReportingRepository(store)
    await repo.getTopProducts({ from, to, scope: 'STAFF', staffId: 'staff-1' })

    const where = invoiceItem.findMany.mock.calls[0][0].where
    expect(where.invoice.staffId).toBe('staff-1')
  })

  it('tính lợi nhuận đúng theo unitCost snapshot từng dòng', async () => {
    const { store, invoiceItem, product } = createReportingStore()
    // Cùng sản phẩm bán 2 lần với giá vốn khác nhau: 100k (2sp) và 150k (3sp)
    invoiceItem.findMany.mockResolvedValue([
      makeInvoiceItemRow('p1', 2, 300_000, 100_000),
      makeInvoiceItemRow('p1', 3, 450_000, 150_000),
    ])
    product.findMany.mockResolvedValue([
      { id: 'p1', name: 'Hàng A', sku: null, costPrice: 150_000 },
    ])

    const repo = createReportingRepository(store)
    const result = await repo.getTopProducts({ from, to, scope: 'ALL', staffId: 'staff-1' })

    // Doanh thu = 750k; cogs = 2×100k + 3×150k = 650k; profit = 100k
    expect(result.items[0].revenue).toBe(750_000)
    expect(result.items[0].quantitySold).toBe(5)
    expect(result.items[0].profit).toBe(100_000)
  })

  it('sắp xếp doanh thu giảm dần và giới hạn 20', async () => {
    const { store, invoiceItem, product } = createReportingStore()
    // 25 sản phẩm, revenue tăng dần theo index
    const rows = Array.from({ length: 25 }, (_, i) =>
      makeInvoiceItemRow(`p${i}`, 1, i * 1_000, 100)
    )
    invoiceItem.findMany.mockResolvedValue(rows)
    const products = Array.from({ length: 25 }, (_, i) => ({
      id: `p${i}`,
      name: `Sản phẩm ${i}`,
      sku: `SP-${i}`,
      costPrice: 100,
    }))
    product.findMany.mockResolvedValue(products)

    const repo = createReportingRepository(store)
    const result = await repo.getTopProducts({ from, to, scope: 'ALL', staffId: 'staff-1' })

    expect(result.items).toHaveLength(20)
    // revenue giảm dần — sản phẩm có revenue cao nhất đứng đầu
    expect(result.items[0].revenue).toBe(24_000)
    expect(result.items[0].productId).toBe('p24')
    expect(result.items[result.items.length - 1].revenue).toBe(5_000)
  })

  it('bỏ qua orphan product (không còn tồn tại)', async () => {
    const { store, invoiceItem, product } = createReportingStore()
    invoiceItem.findMany.mockResolvedValue([
      makeInvoiceItemRow('p-exists', 3, 60_000, 10_000),
      makeInvoiceItemRow('p-deleted', 10, 200_000, 5_000),
    ])
    // product bị xoá không có trong findMany
    product.findMany.mockResolvedValue([{ id: 'p-exists', name: 'Còn tồn tại', sku: null, costPrice: 10_000 }])

    const repo = createReportingRepository(store)
    const result = await repo.getTopProducts({ from, to, scope: 'ALL', staffId: 'staff-1' })

    expect(result.items).toEqual([
      {
        productId: 'p-exists',
        name: 'Còn tồn tại',
        sku: null,
        quantitySold: 3,
        revenue: 60_000,
        unitCost: 10_000,
        profit: 30_000, // 60_000 − 3×10_000
      },
    ])
  })

  it('map tên/SKU theo thứ tự doanh thu', async () => {
    const { store, invoiceItem, product } = createReportingStore()
    invoiceItem.findMany.mockResolvedValue([
      makeInvoiceItemRow('p1', 2, 50_000, 1_000),
      makeInvoiceItemRow('p2', 5, 120_000, 1_000),
      makeInvoiceItemRow('p3', 1, 200_000, 1_000),
    ])
    product.findMany.mockResolvedValue([
      { id: 'p1', name: 'Trà sữa', sku: 'TS-1', costPrice: 1_000 },
      { id: 'p2', name: 'Cà phê', sku: 'CF-1', costPrice: 1_000 },
      { id: 'p3', name: 'Mũ lưỡi trai', sku: null, costPrice: 1_000 },
    ])

    const repo = createReportingRepository(store)
    const result = await repo.getTopProducts({ from, to, scope: 'ALL', staffId: 'staff-1' })

    expect(result.items.map((item) => item.productId)).toEqual(['p3', 'p2', 'p1'])
    expect(result.items[0].name).toBe('Mũ lưỡi trai')
    expect(result.items[1].sku).toBe('CF-1')
    expect(result.items[2].sku).toBe('TS-1')
  })
})
