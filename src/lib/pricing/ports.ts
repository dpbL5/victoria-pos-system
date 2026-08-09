// ── Ports — repository interface cho domain pricing (read-side) ─────
import type { Prisma } from '@/generated/prisma/client'
import type { DayType } from '@/types'
import type { OverlapInfo } from './helpers'

export type PricingRuleWithTiers = Prisma.PricingRuleGetPayload<{
  include: { tiers: { orderBy: { minHours: 'asc' } } }
}>

export interface FindOverlappingRulesInput {
  daysOfWeek: number[]
  hourFrom: number
  hourTo: number | null
  effectiveFrom: Date
  effectiveTo: Date | null
  excludeId?: string
}

export interface PricingRepository {
  /** Rule đang hiệu lực đúng giờ/ngày (hourTo độc quyền), kèm tiers */
  findApplicableRule(currentHour: number, dayType: DayType, at: Date): Promise<PricingRuleWithTiers | null>
  /** Rule + tiers theo ID — dùng để snapshot khi check-in */
  findByIdWithTiers(ruleId: string): Promise<PricingRuleWithTiers | null>
  /** Danh sách rule đang hiệu lực (cho UI dropdown chọn bảng giá) */
  getApplicableRules(at: Date): Promise<PricingRuleWithTiers[]>
  countApplicable(at: Date): Promise<number>
  /** Tổng số rule (bất kể hiệu lực) — cho pricing/status */
  countAll(): Promise<number>
  /** Rule trùng giờ/ngày/ngày hiệu lực (trừ excludeId) — admin overlap check */
  findOverlapping(input: FindOverlappingRulesInput): Promise<OverlapInfo[]>
  /** Toàn bộ rule + tiers — GET /api/pricing */
  findManyWithTiers(): Promise<PricingRuleWithTiers[]>
  /** Rule đơn (không tiers) — cho PUT/DELETE */
  findById(id: string): Promise<Prisma.PricingRuleGetPayload<object> | null>
  /** Tạo rule + tiers trong 1 transaction */
  createWithTiers(data: {
    name: string
    hourFrom: number
    hourTo: number | null
    ratePerHour: number
    daysOfWeek: number[]
    dayType: DayType
    effectiveFrom: Date
    effectiveTo: Date | null
    tiers?: Array<{ minHours: number; ratePerHour: number }>
  }): Promise<Prisma.PricingRuleGetPayload<object>>
  /** Cập nhật rule (không đụng tiers) */
  update(id: string, data: Record<string, unknown>): Promise<Prisma.PricingRuleGetPayload<object>>
  /** Xoá toàn bộ tiers của rule — thay thế bộ tiers mới */
  deleteTiersByRule(ruleId: string): Promise<void>
  /** Tạo nhiều tiers cho rule */
  createTiers(ruleId: string, tiers: Array<{ minHours: number; ratePerHour: number }>): Promise<void>
  /** Xoá rule + tiers (cascade) */
  delete(id: string): Promise<void>
}
