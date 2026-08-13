import { describe, it, expect } from 'vitest'
import { calculatePlayerPrice } from '@/lib/sessions'

// ── calculatePlayerPrice — tiền giờ chơi per-player (played time = elapsed − pause) ──

describe('calculatePlayerPrice', () => {
  const startTime = new Date('2026-08-07T10:00:00Z')

  it('played time trừ pause: chơi 2h, pause 30p → tính 1.5h', () => {
    const result = calculatePlayerPrice({
      startTime,
      endTime: new Date('2026-08-07T12:00:00Z'),
      pausedSeconds: 1800,
      hourlyRate: 100000,
      tiers: [],
      promotion: null,
    })
    expect(result.totalHours).toBe(1.5)
    expect(result.subtotal).toBe(150000)
    expect(result.promotionDiscount).toBe(0)
    expect(result.grandTotal).toBe(150000)
    expect(result.pausedSeconds).toBe(1800)
  })

  it('không pause → played time = elapsed', () => {
    const result = calculatePlayerPrice({
      startTime,
      endTime: new Date('2026-08-07T11:00:00Z'),
      pausedSeconds: 0,
      hourlyRate: 80000,
      tiers: [],
      promotion: null,
    })
    expect(result.totalHours).toBe(1)
    expect(result.grandTotal).toBe(80000)
  })

  it('tiered: bậc luỹ tiến theo từng phân khúc giờ', () => {
    const result = calculatePlayerPrice({
      startTime,
      endTime: new Date('2026-08-07T14:00:00Z'),
      pausedSeconds: 0,
      hourlyRate: 100000,
      tiers: [
        { minHours: 1, ratePerHour: 90000 },
        { minHours: 3, ratePerHour: 70000 },
      ],
      promotion: null,
    })
    // 1h × 100k + 2h × 90k + 1h × 70k = 100 + 180 + 70 = 350k
    expect(result.totalHours).toBe(4)
    expect(result.subtotal).toBe(350000)
    expect(result.grandTotal).toBe(350000)
  })

  it('khuyến mại PERCENT áp dụng trên subtotal của player', () => {
    const result = calculatePlayerPrice({
      startTime,
      endTime: new Date('2026-08-07T12:00:00Z'),
      pausedSeconds: 0,
      hourlyRate: 100000,
      tiers: [],
      promotion: {
        ruleId: 'promo-1',
        name: 'Giảm 10%',
        discountType: 'PERCENT',
        discountValue: 10,
      },
    })
    // subtotal 200k, giảm 10% = 20k
    expect(result.subtotal).toBe(200000)
    expect(result.promotionDiscount).toBe(20000)
    expect(result.grandTotal).toBe(180000)
  })

  it('FIXED_AMOUNT clamp: khuyến mại không vượt subtotal', () => {
    const result = calculatePlayerPrice({
      startTime,
      endTime: new Date('2026-08-07T10:30:00Z'),
      pausedSeconds: 0,
      hourlyRate: 100000,
      tiers: [],
      promotion: {
        ruleId: 'promo-2',
        name: 'Giảm 500k',
        discountType: 'FIXED_AMOUNT',
        discountValue: 500000,
      },
    })
    // subtotal 50k < 500k → discount clamp 50k, grandTotal 0
    expect(result.subtotal).toBe(50000)
    expect(result.promotionDiscount).toBe(50000)
    expect(result.grandTotal).toBe(0)
  })
})
