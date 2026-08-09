import { describe, it, expect } from 'vitest'
import { editInvoiceSchema } from '@/lib/invoicing'

const PRODUCT_UUID = '123e4567-e89b-42d3-a456-426614174000'

// ── editInvoiceSchema ────────────────────────────────────

describe('editInvoiceSchema', () => {
  it('chấp nhận payload hợp lệ đầy đủ', () => {
    const result = editInvoiceSchema.safeParse({
      items: [{ productId: PRODUCT_UUID, quantity: 2 }],
      paymentMethod: 'CASH',
      notes: 'Sửa số lượng',
    })
    expect(result.success).toBe(true)
  })

  it('chấp nhận items rỗng (xoá hết product lines)', () => {
    const result = editInvoiceSchema.safeParse({
      items: [],
      paymentMethod: 'TRANSFER',
    })
    expect(result.success).toBe(true)
  })

  it('mặc định items = [] khi không có', () => {
    const result = editInvoiceSchema.safeParse({ paymentMethod: 'CASH' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.items).toEqual([])
    }
  })

  it('chấp nhận notes null hoặc thiếu', () => {
    const r1 = editInvoiceSchema.safeParse({ paymentMethod: 'CASH', notes: null })
    expect(r1.success).toBe(true)

    const r2 = editInvoiceSchema.safeParse({ paymentMethod: 'CASH' })
    expect(r2.success).toBe(true)
  })

  it('chấp nhận các phương thức CASH/TRANSFER/CARD/MEMBER', () => {
    for (const method of ['CASH', 'TRANSFER', 'CARD', 'MEMBER']) {
      const result = editInvoiceSchema.safeParse({ paymentMethod: method })
      expect(result.success).toBe(true)
    }
  })

  it('từ chối paymentMethod không hợp lệ', () => {
    const result = editInvoiceSchema.safeParse({ paymentMethod: 'VOUCHER' })
    expect(result.success).toBe(false)
  })

  it('từ chối khi thiếu paymentMethod', () => {
    const result = editInvoiceSchema.safeParse({})
    expect(result.success).toBe(false)
  })

  it('từ chối productId không phải UUID', () => {
    const result = editInvoiceSchema.safeParse({
      items: [{ productId: 'not-a-uuid', quantity: 1 }],
      paymentMethod: 'CASH',
    })
    expect(result.success).toBe(false)
  })

  it('từ chối quantity < 1', () => {
    const result = editInvoiceSchema.safeParse({
      items: [{ productId: PRODUCT_UUID, quantity: 0 }],
      paymentMethod: 'CASH',
    })
    expect(result.success).toBe(false)
  })

  it('từ chối quantity > 999', () => {
    const result = editInvoiceSchema.safeParse({
      items: [{ productId: PRODUCT_UUID, quantity: 1000 }],
      paymentMethod: 'CASH',
    })
    expect(result.success).toBe(false)
  })

  it('từ chối quantity không nguyên', () => {
    const result = editInvoiceSchema.safeParse({
      items: [{ productId: PRODUCT_UUID, quantity: 1.5 }],
      paymentMethod: 'CASH',
    })
    expect(result.success).toBe(false)
  })

  it('từ chối notes > 500 ký tự', () => {
    const result = editInvoiceSchema.safeParse({
      paymentMethod: 'CASH',
      notes: 'a'.repeat(501),
    })
    expect(result.success).toBe(false)
  })

  it('từ chối quá 100 items', () => {
    const items = Array.from({ length: 101 }, (_, i) => ({
      productId: `123e4567-e89b-42d3-a456-42661417400${String(i % 10)}`,
      quantity: 1,
    }))
    const result = editInvoiceSchema.safeParse({ items, paymentMethod: 'CASH' })
    expect(result.success).toBe(false)
  })
})
