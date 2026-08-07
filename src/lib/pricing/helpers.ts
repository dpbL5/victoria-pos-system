// ── Pricing helpers — pure functions (không phụ thuộc store/prisma) ─────
import { getVnDay } from '@/lib/utils'
import type { DayType } from '@/types'

export function deriveDayTypeFromDays(daysOfWeek: number[]): DayType {
  const normalizedDays = normalizeDaysOfWeek(daysOfWeek)
  return normalizedDays.length > 0 && normalizedDays.every((day) => day === 0 || day === 6)
    ? 'WEEKEND'
    : 'WEEKDAY'
}

export function normalizeDaysOfWeek(daysOfWeek: number[]): number[] {
  return [...new Set(daysOfWeek)]
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    .sort((left, right) => left - right)
}

export function resolveRuleDaysOfWeek(daysOfWeek: number[] | null | undefined, dayType: DayType): number[] {
  const normalizedDays = normalizeDaysOfWeek(daysOfWeek ?? [])
  if (normalizedDays.length > 0) return normalizedDays
  return dayType === 'WEEKEND' ? [0, 6] : [1, 2, 3, 4, 5]
}

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

export function hasSharedDay(left: number[], right: number[]): boolean {
  return left.some((day) => right.includes(day))
}

export interface OverlapInfo {
  id: string
  name: string
  daysOfWeek: number[]
  hourFrom: number
  hourTo: number | null
  effectiveFrom: Date
  effectiveTo: Date | null
}
