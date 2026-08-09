// ── Pricing helpers — pure functions (không phụ thuộc store/prisma) ─────
import { getVnDay } from '@/lib/shared/utils'
import type { DayType } from '@/types'

export {
  deriveDayTypeFromDays,
  normalizeDays as normalizeDaysOfWeek,
  resolveDays as resolveRuleDaysOfWeek,
  hasSharedDay,
  type OverlapInfo,
} from '@/lib/shared/overlap'

/** Where clause cho rule đang hiệu lực đúng giờ/ngày (hourTo độc quyền) */
export function pricingRuleWhere(
  currentHour: number,
  dayType: DayType,
  at: Date
) {
  return {
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
