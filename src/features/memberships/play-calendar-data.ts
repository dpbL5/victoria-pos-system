import { toInputDate } from '@/lib/shared/utils'

export interface PlayDay {
  day: string
  hours: number
}

export interface PlayCalendarCell {
  day: string
  hours: number
  /** Ngày nằm ngoài năm đang xem — giữ chỗ để lưới thẳng hàng. */
  outside: boolean
  future: boolean
}

export interface PlayCalendarWeek {
  cells: PlayCalendarCell[]
  monthLabel: string | null
}

const DAY_MS = 86_400_000

const dayMs = (day: string) => new Date(`${day}T00:00:00Z`).getTime()
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10)

/**
 * Dựng lưới tuần (thứ Hai → Chủ Nhật) cho một năm dương lịch.
 * Cột là tuần, hàng là thứ — giống contribution graph của GitHub.
 */
export function buildPlayCalendar(
  playDays: PlayDay[],
  year: number,
  today: string = toInputDate(new Date()),
): PlayCalendarWeek[] {
  const hoursByDay = new Map(playDays.map((entry) => [entry.day, entry.hours]))
  const todayMs = dayMs(today)
  const yearStart = Date.UTC(year, 0, 1)
  const yearEnd = Date.UTC(year, 11, 31)
  const firstMonday = yearStart - ((new Date(yearStart).getUTCDay() + 6) % 7) * DAY_MS
  const lastSunday = yearEnd + (6 - ((new Date(yearEnd).getUTCDay() + 6) % 7)) * DAY_MS
  const weekCount = Math.round((lastSunday - firstMonday + DAY_MS) / (7 * DAY_MS))

  const weeks: PlayCalendarWeek[] = []
  for (let weekIndex = 0; weekIndex < weekCount; weekIndex++) {
    const cells: PlayCalendarCell[] = []
    let monthLabel: string | null = null

    for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
      const ms = firstMonday + (weekIndex * 7 + dayIndex) * DAY_MS
      const date = new Date(ms)
      const day = isoDay(ms)
      cells.push({
        day,
        hours: hoursByDay.get(day) ?? 0,
        outside: ms < yearStart || ms > yearEnd,
        future: ms > todayMs,
      })
      // Nhãn tháng đặt ở tuần chứa ngày mùng 1.
      if (date.getUTCDate() === 1 && date.getUTCFullYear() === year) {
        monthLabel = `Th${date.getUTCMonth() + 1}`
      }
    }

    weeks.push({ cells, monthLabel })
  }

  return weeks
}

export function playHoursLabel(hours: number): string {
  if (hours <= 0) return 'Không chơi'
  return `${hours.toLocaleString('vi-VN', { maximumFractionDigits: 2 })} giờ`
}
