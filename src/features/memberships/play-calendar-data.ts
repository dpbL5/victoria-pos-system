import { toInputDate } from '@/lib/shared/utils'

export interface PlayDay {
  day: string
  hours: number
}

export interface PlayCalendarCell {
  day: string
  hours: number
  future: boolean
}

export interface PlayCalendarColumn {
  /** 14 ô: tuần thứ nhất (T2→CN) rồi tuần thứ hai (T2→CN); ngày ngoài năm là `null`. */
  cells: (PlayCalendarCell | null)[]
  monthLabel: string | null
}

const DAY_MS = 86_400_000
const DAYS_PER_COLUMN = 14

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10)

/**
 * Mỗi cột là 2 tuần xếp dọc (T2→CN lặp lại), cả năm nằm trong một khung.
 * Cột cuối có thể chỉ có 1 tuần nếu năm lẻ tuần — phần thiếu là `null`.
 */
export function buildPlayCalendar(
  playDays: PlayDay[],
  year: number,
  today: string = toInputDate(new Date()),
): PlayCalendarColumn[] {
  const hoursByDay = new Map(playDays.map((entry) => [entry.day, entry.hours]))
  const todayMs = new Date(`${today}T00:00:00Z`).getTime()
  const yearStart = Date.UTC(year, 0, 1)
  const yearEnd = Date.UTC(year, 11, 31)
  const firstMonday = yearStart - ((new Date(yearStart).getUTCDay() + 6) % 7) * DAY_MS
  const lastSunday = yearEnd + (6 - ((new Date(yearEnd).getUTCDay() + 6) % 7)) * DAY_MS
  const weekCount = Math.round((lastSunday - firstMonday + DAY_MS) / (7 * DAY_MS))
  const columnCount = Math.ceil(weekCount / 2)

  return Array.from({ length: columnCount }, (_, columnIndex) => {
    let monthLabel: string | null = null

    const cells = Array.from({ length: DAYS_PER_COLUMN }, (_, rowIndex) => {
      const weekIndex = columnIndex * 2 + (rowIndex < 7 ? 0 : 1)
      const dayIndex = rowIndex % 7
      const ms = firstMonday + (weekIndex * 7 + dayIndex) * DAY_MS

      if (weekIndex >= weekCount || ms < yearStart || ms > yearEnd) return null

      const day = isoDay(ms)
      if (new Date(ms).getUTCDate() === 1) {
        monthLabel = `Th${new Date(ms).getUTCMonth() + 1}`
      }

      return {
        day,
        hours: hoursByDay.get(day) ?? 0,
        future: ms > todayMs,
      }
    })

    return { cells, monthLabel }
  })
}

export function playHoursLabel(hours: number): string {
  if (hours <= 0) return 'Không chơi'
  return `${hours.toLocaleString('vi-VN', { maximumFractionDigits: 2 })} giờ`
}
