// ── Promotion helpers — pure functions (không phụ thuộc store/prisma) ─────
import type { PromotionRule } from '@/generated/prisma/client'
import {
  type PromotionDiscountType,
  type PromotionSnapshot,
} from '@/lib/promotion-calculation'
import { getDayType, getVnDay, getVnHour } from '@/lib/shared/utils'
import type { DayType } from '@/types'

export {
  deriveDayTypeFromDays as derivePromotionDayType,
  normalizeDays as normalizePromotionDays,
  resolveDays as resolvePromotionDays,
  hasSharedDay,
  type OverlapInfo as PromotionOverlapInfo,
} from '@/lib/shared/overlap'

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
