import { describe, expect, it } from 'vitest'
import {
  calculatePlayPrice,
  calculatePromotionDiscount,
  toPromotionSnapshot,
  toPromotionMetadata,
  type PromotionSnapshot,
} from '@/lib/promotion-calculation'
import {
  createPromotionRuleSchema,
  updatePromotionRuleSchema,
} from '@/lib/promotions'
import { calculateTieredSubtotal } from '@/lib/promotion-calculation'

const validPromotion = {
  name: 'Giảm giờ ngày thường',
  discountType: 'FIXED_PER_HOUR' as const,
  discountValue: 20_000,
  daysOfWeek: [1, 2, 3, 4, 5],
  hourFrom: 9,
  hourTo: 17,
  effectiveFrom: '2026-07-01',
  isActive: true,
}

const fixedPromotion: PromotionSnapshot = {
  ruleId: 'promotion-fixed',
  name: 'Giảm 20.000đ mỗi giờ',
  discountType: 'FIXED_PER_HOUR',
  discountValue: 20_000,
}

const percentPromotion: PromotionSnapshot = {
  ruleId: 'promotion-percent',
  name: 'Giảm 15%',
  discountType: 'PERCENT_PLAY_TIME',
  discountValue: 15,
}

describe('createPromotionRuleSchema', () => {
  it('chấp nhận khuyến mại giảm cố định theo giờ', () => {
    const result = createPromotionRuleSchema.safeParse(validPromotion)

    expect(result.success).toBe(true)
  })

  it('chấp nhận mức giảm phần trăm bằng 100%', () => {
    const result = createPromotionRuleSchema.safeParse({
      ...validPromotion,
      discountType: 'PERCENT_PLAY_TIME',
      discountValue: 100,
    })

    expect(result.success).toBe(true)
  })

  it('từ chối mức giảm phần trăm bằng 0 hoặc vượt quá 100%', () => {
    const zeroPercent = createPromotionRuleSchema.safeParse({
      ...validPromotion,
      discountType: 'PERCENT_PLAY_TIME',
      discountValue: 0,
    })
    const tooHighPercent = createPromotionRuleSchema.safeParse({
      ...validPromotion,
      discountType: 'PERCENT_PLAY_TIME',
      discountValue: 100.01,
    })

    expect(zeroPercent.success).toBe(false)
    expect(tooHighPercent.success).toBe(false)
  })

  it('từ chối ngày áp dụng trùng, ngoài tuần hoặc để trống', () => {
    const duplicateDays = createPromotionRuleSchema.safeParse({
      ...validPromotion,
      daysOfWeek: [1, 1, 2],
    })
    const invalidDay = createPromotionRuleSchema.safeParse({
      ...validPromotion,
      daysOfWeek: [7],
    })
    const noDays = createPromotionRuleSchema.safeParse({
      ...validPromotion,
      daysOfWeek: [],
    })

    expect(duplicateDays.success).toBe(false)
    expect(invalidDay.success).toBe(false)
    expect(noDays.success).toBe(false)
  })

  it('từ chối khung giờ không hợp lệ và thời hạn kết thúc trước ngày bắt đầu', () => {
    const sameHour = createPromotionRuleSchema.safeParse({
      ...validPromotion,
      hourFrom: 17,
      hourTo: 17,
    })
    const earlierHour = createPromotionRuleSchema.safeParse({
      ...validPromotion,
      hourFrom: 17,
      hourTo: 10,
    })
    const invalidPeriod = createPromotionRuleSchema.safeParse({
      ...validPromotion,
      effectiveFrom: '2026-07-15',
      effectiveTo: '2026-07-14',
    })

    expect(sameHour.success).toBe(false)
    expect(earlierHour.success).toBe(false)
    expect(invalidPeriod.success).toBe(false)
  })

  it('cho phép khung giờ mở và thời hạn kết thúc cùng ngày bắt đầu', () => {
    const result = createPromotionRuleSchema.safeParse({
      ...validPromotion,
      hourTo: null,
      effectiveTo: '2026-07-01',
    })

    expect(result.success).toBe(true)
  })
})

describe('updatePromotionRuleSchema', () => {
  it('cho phép cập nhật từng phần và vẫn chặn phần trăm vượt giới hạn', () => {
    const partialUpdate = updatePromotionRuleSchema.safeParse({ isActive: false })
    const tooHighPercent = updatePromotionRuleSchema.safeParse({
      discountType: 'PERCENT_PLAY_TIME',
      discountValue: 101,
    })

    expect(partialUpdate.success).toBe(true)
    expect(tooHighPercent.success).toBe(false)
  })
})

describe('calculatePlayPrice', () => {
  it('không giảm giá khi không có khuyến mại', () => {
    const result = calculatePlayPrice({
      totalHours: 1.5,
      hourlyRate: 100_000,
    })

    expect(result).toEqual({
      subtotal: 150_000,
      promotionDiscount: 0,
      grandTotal: 150_000,
    })
  })

  it('giảm số tiền cố định theo từng giờ chơi', () => {
    const result = calculatePlayPrice({
      totalHours: 2.5,
      hourlyRate: 120_000,
      promotion: fixedPromotion,
    })

    expect(result).toEqual({
      subtotal: 300_000,
      promotionDiscount: 50_000,
      grandTotal: 250_000,
    })
  })

  it('giảm phần trăm trên tổng tiền giờ chơi', () => {
    const result = calculatePlayPrice({
      totalHours: 2.5,
      hourlyRate: 150_000,
      promotion: percentPromotion,
    })

    expect(result).toEqual({
      subtotal: 375_000,
      promotionDiscount: 56_250,
      grandTotal: 318_750,
    })
  })

  it('làm tròn subtotal và giảm phần trăm về đơn vị đồng gần nhất', () => {
    const result = calculatePlayPrice({
      totalHours: 1.25,
      hourlyRate: 100_001,
      promotion: {
        ...percentPromotion,
        discountValue: 12.5,
      },
    })

    expect(result).toEqual({
      subtotal: 125_001,
      promotionDiscount: 15_625,
      grandTotal: 109_376,
    })
  })

  it('giới hạn giảm giá không vượt quá tổng tiền giờ chơi', () => {
    const result = calculatePlayPrice({
      totalHours: 2,
      hourlyRate: 50_000,
      promotion: {
        ...fixedPromotion,
        discountValue: 80_000,
      },
    })

    expect(result).toEqual({
      subtotal: 100_000,
      promotionDiscount: 100_000,
      grandTotal: 0,
    })
  })

  it('trả về 0 khi giờ chơi hoặc giá giờ chơi bằng 0', () => {
    const noHours = calculatePlayPrice({
      totalHours: 0,
      hourlyRate: 100_000,
      promotion: fixedPromotion,
    })
    const noRate = calculatePlayPrice({
      totalHours: 2,
      hourlyRate: 0,
      promotion: percentPromotion,
    })

    expect(noHours).toEqual({ subtotal: 0, promotionDiscount: 0, grandTotal: 0 })
    expect(noRate).toEqual({ subtotal: 0, promotionDiscount: 0, grandTotal: 0 })
  })
})

describe('calculatePromotionDiscount', () => {
  it('bỏ qua khuyến mại có giá trị giảm không hợp lệ', () => {
    const result = calculatePromotionDiscount({
      totalHours: 2,
      subtotal: 200_000,
      promotion: {
        ...percentPromotion,
        discountValue: 0,
      },
    })

    expect(result).toBe(0)
  })
})

describe('toPromotionSnapshot', () => {
  it('chuyển dữ liệu snapshot hợp lệ, kể cả số Decimal dạng chuỗi', () => {
    const snapshot = toPromotionSnapshot({
      promotionRuleId: 'promotion-1',
      promotionName: 'Giảm 10%',
      promotionDiscountType: 'PERCENT_PLAY_TIME',
      promotionDiscountValue: '10',
    })

    expect(snapshot).toEqual({
      ruleId: 'promotion-1',
      name: 'Giảm 10%',
      discountType: 'PERCENT_PLAY_TIME',
      discountValue: 10,
    })
  })

  it('không tạo snapshot khi dữ liệu khuyến mại chưa đầy đủ', () => {
    const snapshot = toPromotionSnapshot({
      promotionRuleId: 'promotion-1',
      promotionName: null,
      promotionDiscountType: 'PERCENT_PLAY_TIME',
      promotionDiscountValue: 10,
    })

    expect(snapshot).toBeNull()
  })

  it('không tạo snapshot khi discountValue <= 0', () => {
    const snapshot = toPromotionSnapshot({
      promotionRuleId: 'promotion-1',
      promotionName: 'Giảm 0đ',
      promotionDiscountType: 'FIXED_AMOUNT',
      promotionDiscountValue: 0,
    })

    expect(snapshot).toBeNull()
  })
})

describe('toPromotionMetadata', () => {
  it('gói đủ field vào metadata để snapshot xuống dòng PLAY_TIME', () => {
    const metadata = toPromotionMetadata(percentPromotion)
    expect(metadata).toEqual({
      ruleId: 'promotion-percent',
      name: 'Giảm 15%',
      discountType: 'PERCENT_PLAY_TIME',
      discountValue: 15,
    })
  })

  it('trả null khi không có khuyến mại', () => {
    expect(toPromotionMetadata(null)).toBeNull()
  })
})

// ── calculateTieredSubtotal — giá luỹ tiến theo giờ ──────────

describe('calculateTieredSubtotal', () => {
  it('không có tier → tính thẳng baseRate × totalHours', () => {
    const result = calculateTieredSubtotal(100_000, [], 3)
    expect(result).toBe(300_000)
  })

  it('1 tier: giờ đầu 100k, các giờ sau 60k — chơi 4h = 100k + 3×60k = 280k', () => {
    const result = calculateTieredSubtotal(100_000, [{ minHours: 1, ratePerHour: 60_000 }], 4)
    expect(result).toBe(280_000)
  })

  it('1 tier: chơi đúng 1h — chỉ tính baseRate', () => {
    const result = calculateTieredSubtotal(100_000, [{ minHours: 1, ratePerHour: 60_000 }], 1)
    expect(result).toBe(100_000)
  })

  it('1 tier: chơi 0.5h — tính baseRate cho 0.5h', () => {
    const result = calculateTieredSubtotal(100_000, [{ minHours: 1, ratePerHour: 60_000 }], 0.5)
    expect(result).toBe(50_000)
  })

  it('2 tiers: 0-1h=100k, 1-2h=80k, ≥2h=60k — chơi 5h', () => {
    const tiers = [
      { minHours: 1, ratePerHour: 80_000 },
      { minHours: 2, ratePerHour: 60_000 },
    ]
    // 1h × 100k + 1h × 80k + 3h × 60k = 100k + 80k + 180k = 360k
    const result = calculateTieredSubtotal(100_000, tiers, 5)
    expect(result).toBe(360_000)
  })

  it('2 tiers: chơi đúng 1.5h — cắt ngang tier', () => {
    const tiers = [
      { minHours: 1, ratePerHour: 80_000 },
      { minHours: 2, ratePerHour: 60_000 },
    ]
    // 1h × 100k + 0.5h × 80k = 140k
    const result = calculateTieredSubtotal(100_000, tiers, 1.5)
    expect(result).toBe(140_000)
  })

  it('trả về 0 khi totalHours = 0', () => {
    const result = calculateTieredSubtotal(100_000, [{ minHours: 1, ratePerHour: 60_000 }], 0)
    expect(result).toBe(0)
  })

  it('baseRate = 0, tiers có giá → vẫn tính luỹ tiến đúng', () => {
    const result = calculateTieredSubtotal(0, [{ minHours: 1, ratePerHour: 80_000 }], 3)
    // 1h × 0 + 2h × 80k = 160k
    expect(result).toBe(160_000)
  })
})
