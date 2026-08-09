// ── Shared overlap helpers — dùng chung cho pricing + promotions ─────
// Các hàm day-normalization + overlap detection byte-identical giữa 2 domain.
import type { DayType } from '@/types'

/** Chuẩn hoá mảng daysOfWeek: dedupe, filter 0-6, sort asc */
export function normalizeDays(daysOfWeek: number[]): number[] {
  return [...new Set(daysOfWeek)]
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    .sort((left, right) => left - right)
}

/** Suy dayType từ daysOfWeek: chỉ toàn T7/CN → WEEKEND, ngược lại WEEKDAY */
export function deriveDayTypeFromDays(daysOfWeek: number[]): DayType {
  const normalizedDays = normalizeDays(daysOfWeek)
  return normalizedDays.length > 0 && normalizedDays.every((day) => day === 0 || day === 6)
    ? 'WEEKEND'
    : 'WEEKDAY'
}

/** Resolve daysOfWeek theo dayType: nếu rỗng → [0,6] (WEEKEND) / [1..5] (WEEKDAY) */
export function resolveDays(daysOfWeek: number[] | null | undefined, dayType: DayType): number[] {
  const normalizedDays = normalizeDays(daysOfWeek ?? [])
  if (normalizedDays.length > 0) return normalizedDays
  return dayType === 'WEEKEND' ? [0, 6] : [1, 2, 3, 4, 5]
}

/** Hai mảng ngày có ngày trùng nhau không */
export function hasSharedDay(left: number[], right: number[]): boolean {
  return left.some((day) => right.includes(day))
}

/** Thông tin overlap chung — pricing rule / promotion rule */
export interface OverlapInfo {
  id: string
  name: string
  daysOfWeek: number[]
  hourFrom: number
  hourTo: number | null
  effectiveFrom: Date
  effectiveTo: Date | null
}
