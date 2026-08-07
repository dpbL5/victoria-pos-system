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
}
