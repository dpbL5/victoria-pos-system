// ── Precalc tiền giờ chơi ngay tại client ────────────────────────────────
// Adapter mỏng gọi `pricePlayers` — cùng hàm thuần với quote server. Dữ liệu
// đã có sẵn trong session row (snapshot bảng giá + pause từng người) nên drawer
// hiện tiền ngay khi mở thay vì chờ `/checkout-preview`.
// Server vẫn là nguồn chân lý: quote server ghi đè khi về.
//
// Import từ module lá (checkout-quote-core) chứ không qua barrel `@/lib/sessions`
// để không kéo prisma vào bundle client.

import { pricePlayers, type PricedPlayerRow } from '@/lib/sessions/checkout-quote-core'
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
  const players: PricedPlayerRow[] = input.players.map((player) => ({
    id: player.id,
    name: player.name,
    pausedAt: player.pausedAt ? new Date(player.pausedAt) : null,
    totalPausedSeconds: player.totalPausedSeconds,
    hourlyRate: player.rule.ratePerHour,
    tiers: player.rule.tiers,
    ruleName: player.rule.name,
  }))

  const priced = pricePlayers({
    startTime: new Date(input.startTime),
    endTime: new Date(input.endTime),
    players,
    promotion: input.promotion,
    sessionPause: {
      pausedAt: input.sessionPause.pausedAt ? new Date(input.sessionPause.pausedAt) : null,
      totalPausedSeconds: input.sessionPause.totalPausedSeconds,
    },
  })
  if (!priced) return null

  return {
    totalHours: priced.totalHours,
    subtotal: priced.subtotal,
    discountAmount: priced.discountAmount,
    grandTotal: priced.grandTotal,
    playerPricing: priced.playerPricing,
  }
}
