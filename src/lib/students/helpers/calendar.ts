import { getVnDay, parseLocalDate, toInputDate } from '@/lib/shared/utils'

export const DAY_MS = 86_400_000
export const CALENDAR_TIMEZONE = 'Asia/Ho_Chi_Minh'
export const SERIES_HORIZON_DAYS = 84

export function lessonEnd(lesson: { startsAt: Date; durationMin: number }): Date {
  return new Date(lesson.startsAt.getTime() + lesson.durationMin * 60_000)
}
export function overlaps(a: { startsAt: Date; durationMin: number }, b: { startsAt: Date; durationMin: number }) {
  return a.startsAt < lessonEnd(b) && b.startsAt < lessonEnd(a)
}
export function vnDateTime(value: Date): string {
  return new Date(value.getTime() + 7 * 3_600_000).toISOString().slice(0, 16)
}
export function eventId(id: string): string { return `ql${id.replaceAll('-', '')}` }

export interface WeeklySchedule {
  daysOfWeek: number[]
  startTime: string
  startsOn: Date
  endsOn?: Date | null
  intervalWeeks: number
  occurrenceCount?: number | null
}

/** Tính occurrence từ mốc đầu chuỗi, kể cả khi truy vấn một khoảng ở xa. */
export function weeklyOccurrences(schedule: WeeklySchedule, from: Date, to: Date): Date[] {
  const start = parseLocalDate(toInputDate(schedule.startsOn)).getTime()
  const weekAnchor = start - ((getVnDay(new Date(start)) + 6) % 7) * DAY_MS
  const [hour, minute] = schedule.startTime.split(':').map(Number)
  const end = Math.min(to.getTime(), schedule.endsOn?.getTime() ?? Infinity)
  const result: Date[] = []
  let count = 0
  // Quét từ đầu để COUNT luôn đúng; khoảng lịch được giới hạn 10 năm ở biên API.
  for (let day = start; day <= end; day += DAY_MS) {
    if (Math.floor((day - weekAnchor) / (7 * DAY_MS)) % schedule.intervalWeeks !== 0) continue
    if (!schedule.daysOfWeek.includes(getVnDay(new Date(day)))) continue
    const date = new Date(day + (hour * 60 + minute) * 60_000)
    if (date < schedule.startsOn || date.getTime() > end) continue
    count++
    if (schedule.occurrenceCount && count > schedule.occurrenceCount) break
    if (date >= from && date < to) result.push(date)
  }
  return result
}

export function weeklyRrule(schedule: WeeklySchedule) {
  const days = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']
  let rule = `RRULE:FREQ=WEEKLY;WKST=MO;INTERVAL=${schedule.intervalWeeks};BYDAY=${[...new Set(schedule.daysOfWeek)].sort().map(d => days[d]).join(',')}`
  if (schedule.occurrenceCount) rule += `;COUNT=${schedule.occurrenceCount}`
  if (schedule.endsOn) rule += `;UNTIL=${schedule.endsOn.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`
  return rule
}
