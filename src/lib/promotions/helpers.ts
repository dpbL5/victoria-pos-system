// ── Promotion helpers — pure functions (không phụ thuộc store/prisma) ─────
import type { PromotionRule } from '@/generated/prisma/client'
import {
  type PromotionDiscountType,
  type PromotionSnapshot,
} from '@/lib/promotion-calculation'
import { getDayType, getVnDay, getVnHour } from '@/lib/utils'
import type { DayType } from '@/types'

export interface PromotionOverlapInfo {
  id: string
  name: string
  daysOfWeek: number[]
  hourFrom: number
  hourTo: number | null
  effectiveFrom: Date
  effectiveTo: Date | null
}

export function normalizePromotionDays(daysOfWeek: number[]): number[] {
  return [...new Set(daysOfWeek)]
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    .sort((left, right) => left - right)
}

export function derivePromotionDayType(daysOfWeek: number[]): DayType {
  const normalizedDays = normalizePromotionDays(daysOfWeek)
  return normalizedDays.length > 0 && normalizedDays.every((day) => day === 0 || day === 6)
    ? 'WEEKEND'
    : 'WEEKDAY'
}

export function resolvePromotionDays(daysOfWeek: number[] | null | undefined, dayType: DayType): number[] {
  const normalizedDays = normalizePromotionDays(daysOfWeek ?? [])
  if (normalizedDays.length > 0) return normalizedDays
  return dayType === 'WEEKEND' ? [0, 6] : [1, 2, 3, 4, 5]
}

export function toPromotionSnapshot(rule: Pick<
  PromotionRule,
  'id' | 'name' | 'discountType' | 'discountValue'
>): PromotionSnapshot {
  return {
    ruleId: rule.id,
    name: rule.name,
    discountType: rule.discountType as PromotionDiscountType,
    discountValue: Number(rule.discountValue),
  }
}

/** Where clause cho promotion đang hiệu lực đúng giờ/ngày */
export function promotionRuleWhere(at: Date) {
  const currentHour = getVnHour(at)
  const dayType = getDayType(at)

  return {
    isActive: true,
    hourFrom: { lte: currentHour },
    OR: [
      { hourTo: null },
      { hourTo: { gt: currentHour } },
    ],
    effectiveFrom: { lte: at },
    AND: [
      {
        OR: [
          { effectiveTo: null },
          { effectiveTo: { gte: at } },
        ],
      },
      {
        OR: [
          { daysOfWeek: { has: getVnDay(at) } },
          {
            daysOfWeek: { isEmpty: true },
            dayType,
          },
        ],
      },
    ],
  }
}

export function hasSharedDay(left: number[], right: number[]): boolean {
  return left.some((day) => right.includes(day))
}
