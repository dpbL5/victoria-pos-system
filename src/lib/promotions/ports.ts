// ── Ports — repository interface cho domain promotions (read-side) ─────
import type { PromotionSnapshot } from '@/lib/promotion-calculation'
import type { PromotionOverlapInfo } from './helpers'

export interface FindOverlappingPromotionsInput {
  daysOfWeek: number[]
  hourFrom: number
  hourTo: number | null
  effectiveFrom: Date
  effectiveTo: Date | null
  excludeId?: string
}

export interface PromotionRepository {
  /** Các promotion đang hiệu lực — snapshot cho checkout */
  findAvailable(at: Date): Promise<PromotionSnapshot[]>
  /** Promotion hiệu lực theo ID (dùng để pre-check khi chọn promotion) */
  findAvailableById(id: string, at: Date): Promise<PromotionSnapshot | null>
  /** Promotion ACTIVE trùng giờ/ngày/ngày hiệu lực (trừ excludeId) */
  findOverlapping(input: FindOverlappingPromotionsInput): Promise<PromotionOverlapInfo[]>
}
