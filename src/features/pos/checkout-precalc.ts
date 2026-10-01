// ── Precalc tiền giờ chơi ngay tại client ────────────────────────────────
// Dùng lại ĐÚNG pure function của server (`calculatePlayerPrice`) trên dữ liệu
// đã có sẵn trong session row (snapshot bảng giá + pause từng người), để drawer
// hiện tiền ngay khi mở thay vì chờ `/checkout-preview` (7 round trip ~430ms).
// Server vẫn là nguồn chân lý: quote server luôn ghi đè khi về, và POST /checkout
// vẫn tính lại toàn bộ.
//
// Import từ module lá (`pricing-engine`, `ports`) chứ không qua barrel
// `@/lib/sessions`: barrel re-export các use-case nên sẽ kéo prisma vào bundle
// client. Hai module lá này chỉ có hàm thuần + type.

import { calculatePlayerPrice } from '@/lib/sessions/pricing-engine'
import { playerPausedSeconds, sessionPauseSeconds } from '@/lib/sessions/ports'
import type { PromotionSnapshot } from '@/lib/promotion-calculation'
import type { PlayTimeQuote } from '@/types'

export interface PrecalcRule {
  name: string
  ratePerHour: number
  tiers: { minHours: number; ratePerHour: number }[]
}

export interface PrecalcPlayer {
  id: string
  name: string | null
  pausedAt: string | null
  totalPausedSeconds: number
  /** Bảng giá áp cho người này — snapshot của group, hoặc bảng chọn tại checkout */
  rule: PrecalcRule
}

export interface PrecalcInput {
  startTime: string
  /** Thời điểm chốt tiền — precalc chỉ chạy khi đã chốt (frozenAt) */
  endTime: string
  promotion: PromotionSnapshot | null
  players: PrecalcPlayer[]
  /** Pause session-level — fallback cho phiên 1 người cũ chưa đồng bộ pause xuống player */
  sessionPause: { pausedAt: string | null; totalPausedSeconds: number }
}

export type PrecalcQuote = Pick<
  PlayTimeQuote,
  'totalHours' | 'subtotal' | 'discountAmount' | 'grandTotal' | 'playerPricing'
>

/** Trả null khi không đủ dữ liệu để tính chắc chắn — caller fallback về quote server. */
export function precalcPlayTime(input: PrecalcInput): PrecalcQuote | null {
  const { startTime, endTime, promotion, players, sessionPause } = input
  if (players.length === 0) return null

  const start = new Date(startTime)
  const end = new Date(endTime)

  const priceOf = (player: PrecalcPlayer) => {
    const ownPausedSeconds = playerPausedSeconds(player, end)
    // Khớp route preview: quote đúng 1 người mà pause của người đó bằng 0 thì
    // lấy pause session-level (phiên cũ pause toàn phiên, chưa đồng bộ xuống player).
    const pausedSeconds =
      players.length === 1 && ownPausedSeconds === 0
        ? sessionPauseSeconds(sessionPause, end)
        : ownPausedSeconds
    return {
      pausedSeconds,
      result: calculatePlayerPrice({
        startTime: start,
        endTime: end,
        pausedSeconds,
        hourlyRate: player.rule.ratePerHour,
        tiers: player.rule.tiers,
        promotion,
      }),
    }
  }

  const totals = {
    totalHours: 0,
    subtotal: 0,
    discountAmount: 0,
    grandTotal: 0,
  }
  const playerPricing: NonNullable<PlayTimeQuote['playerPricing']> = []

  for (const player of players) {
    const { result } = priceOf(player)
    totals.totalHours += result.totalHours
    totals.subtotal += result.subtotal
    totals.discountAmount += result.promotionDiscount
    totals.grandTotal += result.grandTotal
    playerPricing.push({
      id: player.id,
      name: player.name ?? '',
      totalHours: result.totalHours,
      subtotal: result.subtotal,
      discountAmount: result.promotionDiscount,
      total: result.grandTotal,
      pricingRuleName: player.rule.name,
    })
  }

  return {
    totalHours: totals.totalHours,
    subtotal: totals.subtotal,
    discountAmount: totals.discountAmount,
    grandTotal: totals.grandTotal,
    playerPricing,
  }
}
