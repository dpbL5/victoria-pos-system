// ── Helpers: RRULE weekly + sinh các buổi học theo tuần (giờ Việt Nam) ─────
import { parseLocalDate, toInputDate, getVnDay } from '@/lib/shared/utils'

const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const

/** "18:00" → số phút từ 00:00 (1080). */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

/** FREQ=WEEKLY;BYDAY=MO,TH — daysOfWeek là [1,4] (0=Chủ nhật). */
export function buildWeeklyRrule(daysOfWeek: number[]): string {
  const byday = daysOfWeek
    .slice()
    .sort((a, b) => a - b)
    .map((d) => WEEKDAYS[d])
    .join(',')
  return `FREQ=WEEKLY;BYDAY=${byday}`
}

/** Giải mã ngày tuần từ RRULE weekly. Trả về [] nếu không parse được. */
export function parseRruleDays(rrule: string): number[] {
  const match = /BYDAY=([A-Z,]+)/.exec(rrule)
  if (!match) return []
  return match[1]
    .split(',')
    .map((d) => WEEKDAYS.indexOf(d as (typeof WEEKDAYS)[number]))
    .filter((d) => d >= 0)
    .sort((a, b) => a - b)
}

/**
 * Sinh các thời điểm bắt đầu buổi học giữa `from` và `to` (inclusive, theo ngày giờ VN).
 * - `daysOfWeek`: [0-6] (0=Chủ nhật) — kiểm tra đúng ngày tuần giờ Việt Nam (`getVnDay`).
 * - `startTime`: "HH:mm" — giờ Việt Nam (làm tròn xuống phút).
 */
export function generateOccurrences(
  daysOfWeek: number[],
  startTime: string,
  from: Date,
  to: Date,
): Date[] {
  const fromDay = parseLocalDate(toInputDate(from))
  const toDay = parseLocalDate(toInputDate(to))
  const minutes = timeToMinutes(startTime)
  const results: Date[] = []

  for (let day = fromDay.getTime(); day <= toDay.getTime(); day += 24 * 60 * 60 * 1000) {
    const date = new Date(day)
    if (!daysOfWeek.includes(getVnDay(date))) continue
    const start = new Date(date.getTime() + minutes * 60 * 1000)
    if (start.getTime() < from.getTime()) continue
    results.push(start)
  }

  return results
}
