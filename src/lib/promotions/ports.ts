// ── Ports — repository interface cho domain promotions (read-side) ─────
import type { Prisma } from '@/generated/prisma/client'
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

export type PromotionRuleRow = Prisma.PromotionRuleGetPayload<object>

export interface PromotionRepository {
  /** Các promotion đang hiệu lực — snapshot cho checkout */
  findAvailable(at: Date): Promise<PromotionSnapshot[]>
  /** Promotion hiệu lực theo ID (dùng để pre-check khi chọn promotion) */
  findAvailableById(id: string, at: Date): Promise<PromotionSnapshot | null>
  /** Promotion ACTIVE trùng giờ/ngày/ngày hiệu lực (trừ excludeId) */
  findOverlapping(input: FindOverlappingPromotionsInput): Promise<PromotionOverlapInfo[]>
  /** Toàn bộ promotion — GET /api/promotions */
  findMany(): Promise<PromotionRuleRow[]>
  /** Promotion đơn — cho PUT/DELETE */
  findById(id: string): Promise<PromotionRuleRow | null>
  /** Tạo promotion */
  create(data: {
    name: string
    discountType: string
    discountValue: number
    daysOfWeek: number[]
    hourFrom: number
    hourTo: number | null
    dayType: string
    effectiveFrom: Date
    effectiveTo: Date | null
    isActive: boolean
  }): Promise<PromotionRuleRow>
  /** Cập nhật promotion */
  update(id: string, data: Record<string, unknown>): Promise<PromotionRuleRow>
  /** Xoá promotion */
  delete(id: string): Promise<void>
}
