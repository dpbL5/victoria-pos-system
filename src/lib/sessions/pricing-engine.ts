// ── Per-player pricing — pure leaf, client-safe ─────────────────────────
import {
  calculatePromotionDiscount,
  calculateTieredSubtotal,
  type PromotionSnapshot,
} from '@/lib/promotion-calculation'
import { calcHours } from '@/lib/shared/utils'

// ── Tính tiền giờ chơi theo từng người chơi (checkout per-player) ──

export interface PlayerPricingParams {
  startTime: Date
  endTime: Date
  /** Giây tạm dừng riêng của player — played time = elapsed − paused */
  pausedSeconds: number
  hourlyRate: number
  tiers: { minHours: number; ratePerHour: number }[]
  promotion: PromotionSnapshot | null
}

export interface PlayerPricingResult {
  /** Played time riêng (giờ, đã trừ pause) */
  totalHours: number
  /** Tiền giờ chơi riêng (tiered subtotal) */
  subtotal: number
  /** Khuyến mại riêng (clamp theo subtotal) */
  promotionDiscount: number
  /** Số tiền người chơi này phải trả cho giờ chơi */
  grandTotal: number
  pausedSeconds: number
}

/**
 * Tính tiền giờ chơi cho 1 người chơi — pure function (không deps).
 * Khi checkout từng người: gọi hàm này cho từng player, cộng tổng lại.
 */
export function calculatePlayerPrice(params: PlayerPricingParams): PlayerPricingResult {
  const { startTime, endTime, pausedSeconds, hourlyRate, tiers, promotion } = params
  // Played time = thời gian chơi thực (elapsed − pause), không phải paused time
  const totalHours = calcHours(startTime, endTime, pausedSeconds)
  const subtotal = calculateTieredSubtotal(hourlyRate, tiers, totalHours)
  const promotionDiscount = promotion
    ? calculatePromotionDiscount({ totalHours, subtotal, promotion })
    : 0
  return {
    totalHours,
    subtotal,
    promotionDiscount,
    grandTotal: Math.max(0, subtotal - promotionDiscount),
    pausedSeconds,
  }
}
