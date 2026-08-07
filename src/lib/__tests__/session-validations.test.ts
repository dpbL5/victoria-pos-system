import { describe, it, expect } from 'vitest'
import { checkoutSessionSchema } from '@/lib/validations/session'

const PRODUCT_UUID = '123e4567-e89b-42d3-a456-426614174000'

// ── checkoutSessionSchema ───────────────────────────────

describe('checkoutSessionSchema', () => {
  it('từ chối paymentMethod = MEMBER khi checkout', () => {
    const result = checkoutSessionSchema.safeParse({ paymentMethod: 'MEMBER' })
    expect(result.success).toBe(false)
  })

  it('chấp nhận các phương thức CASH/TRANSFER/CARD', () => {
    for (const method of ['CASH', 'TRANSFER', 'CARD']) {
      const result = checkoutSessionSchema.safeParse({ paymentMethod: method })
      expect(result.success).toBe(true)
    }
  })

  it('từ chối paymentMethod không nằm trong enum', () => {
    const result = checkoutSessionSchema.safeParse({ paymentMethod: 'VOUCHER' })
    expect(result.success).toBe(false)
  })

  it('từ chối khi thiếu paymentMethod', () => {
    const result = checkoutSessionSchema.safeParse({})
    expect(result.success).toBe(false)
  })

  it('mặc định items = [] và parkingVehicleCount = 0', () => {
    const result = checkoutSessionSchema.safeParse({ paymentMethod: 'CASH' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.items).toEqual([])
      expect(result.data.parkingVehicleCount).toBe(0)
    }
  })

  it('chấp nhận promotionRuleId UUID hoặc null', () => {
    const withUuid = checkoutSessionSchema.safeParse({
      paymentMethod: 'CASH',
      promotionRuleId: PRODUCT_UUID,
    })
    const withNull = checkoutSessionSchema.safeParse({
      paymentMethod: 'CASH',
      promotionRuleId: null,
    })
    expect(withUuid.success).toBe(true)
    expect(withNull.success).toBe(true)
  })

  it('từ chối promotionRuleId không phải UUID', () => {
    const result = checkoutSessionSchema.safeParse({
      paymentMethod: 'CASH',
      promotionRuleId: 'abc',
    })
    expect(result.success).toBe(false)
  })

  it('từ chối notes > 500 ký tự', () => {
    const result = checkoutSessionSchema.safeParse({
      paymentMethod: 'CASH',
      notes: 'A'.repeat(501),
    })
    expect(result.success).toBe(false)
  })

  it('chấp nhận endTime datetime ISO', () => {
    const result = checkoutSessionSchema.safeParse({
      paymentMethod: 'CASH',
      endTime: '2026-08-06T12:00:00Z',
    })
    expect(result.success).toBe(true)
  })

  it('từ chối endTime không đúng định dạng', () => {
    const result = checkoutSessionSchema.safeParse({
      paymentMethod: 'CASH',
      endTime: '06/08/2026',
    })
    expect(result.success).toBe(false)
  })

  it('chấp nhận items hợp lệ kèm pricingGroupId + playerCount', () => {
    const result = checkoutSessionSchema.safeParse({
      paymentMethod: 'CASH',
      items: [{ productId: PRODUCT_UUID, quantity: 2 }],
      pricingGroupId: PRODUCT_UUID,
      playerCount: 2,
    })
    expect(result.success).toBe(true)
  })

  it('từ chối quantity = 0 trong items', () => {
    const result = checkoutSessionSchema.safeParse({
      paymentMethod: 'CASH',
      items: [{ productId: PRODUCT_UUID, quantity: 0 }],
    })
    expect(result.success).toBe(false)
  })

  it('từ chối playerCount = 0', () => {
    const result = checkoutSessionSchema.safeParse({
      paymentMethod: 'CASH',
      playerCount: 0,
    })
    expect(result.success).toBe(false)
  })

  it('từ chối parkingVehicleCount âm', () => {
    const result = checkoutSessionSchema.safeParse({
      paymentMethod: 'CASH',
      parkingVehicleCount: -1,
    })
    expect(result.success).toBe(false)
  })
})
