'use client'

import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { MonthNav } from '@/components/ui/month-nav'
import { toInputDate } from '@/lib/shared/utils'
import type { Month } from '@/lib/shared/month'

/** Một tuần T2–CN giao với tháng đang chọn. */
export interface ReportsWeek {
  /** Thứ Hai (YYYY-MM-DD) */
  from: string
  /** Chủ nhật (YYYY-MM-DD), đã chặn ở hôm nay */
  to: string
  /** Nhãn hiển thị "dd/mm–dd/mm" theo đúng tuần lịch */
  label: string
}

/**
 * Các tuần (Thứ Hai → Chủ nhật) giao với tháng đang chọn. Tuần đầu/cuối có thể
 * lấn sang tháng kề. `to` chặn ở hôm nay; tuần hoàn toàn ở tương lai bị bỏ.
 */
export function monthWeeks({ year, month }: Month, now = new Date()): ReportsWeek[] {
  const today = toInputDate(now)
  const first = new Date(Date.UTC(year, month - 1, 1))
  const last = new Date(Date.UTC(year, month, 0))
  const cursor = new Date(first)
  cursor.setUTCDate(first.getUTCDate() - ((first.getUTCDay() + 6) % 7))

  const weeks: ReportsWeek[] = []
  while (cursor <= last) {
    const from = cursor.toISOString().slice(0, 10)
    if (from > today) break
    const sunday = new Date(cursor)
    sunday.setUTCDate(cursor.getUTCDate() + 6)
    const sundayStr = sunday.toISOString().slice(0, 10)
    weeks.push({
      from,
      to: sundayStr > today ? today : sundayStr,
      label: `${shortDate(from)}–${shortDate(sundayStr)}`,
    })
    cursor.setUTCDate(cursor.getUTCDate() + 7)
  }
  return weeks
}

interface ReportsMonthFilterProps {
  year: number
  month: number
  /** Ngày đầu tháng — min cho ô chọn ngày. */
  minDay: string
  /** Ngày cuối tháng đã chặn ở hôm nay — max cho ô chọn ngày. */
  maxDay: string
  /** Ngày đang xem (YYYY-MM-DD); null = không xem ngày lẻ. */
  day: string | null
  /** Các tuần của tháng để chọn nhanh. */
  weeks: ReportsWeek[]
  /** Thứ Hai của tuần đang xem; null = không xem tuần. */
  weekStart: string | null
  loading: boolean
  onPrev: () => void
  onNext: () => void
  canGoNext: boolean
  onDayChange: (day: string | null) => void
  onWeekChange: (weekStart: string | null) => void
}

function chipClass(active: boolean): string {
  return `rounded-lg px-2.5 py-1.5 text-xs font-medium tabular-nums transition-colors ${
    active
      ? 'bg-info text-white'
      : 'bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50 dark:bg-zinc-900 dark:text-zinc-300 dark:ring-zinc-800 dark:hover:bg-zinc-800'
  }`
}

export function ReportsMonthFilter({
  year,
  month,
  minDay,
  maxDay,
  day,
  weeks,
  weekStart,
  loading,
  onPrev,
  onNext,
  canGoNext,
  onDayChange,
  onWeekChange,
}: ReportsMonthFilterProps) {
  const selectedWeek = weekStart ? weeks.find((week) => week.from === weekStart) ?? null : null
  const activeLabel = day
    ? `Ngày ${formatDay(day)}`
    : selectedWeek
      ? `Tuần ${selectedWeek.label}`
      : `Tháng ${month}/${year}`

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <MonthNav
        label={activeLabel}
        loading={loading}
        onPrev={onPrev}
        onNext={onNext}
        canGoNext={canGoNext}
      />

      {weeks.length > 1 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Tuần
          </span>
          {weeks.map((week) => (
            <button
              key={week.from}
              type="button"
              aria-pressed={weekStart === week.from}
              onClick={() => onWeekChange(weekStart === week.from ? null : week.from)}
              className={chipClass(weekStart === week.from)}
            >
              {week.label}
            </button>
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <div className="w-40">
          <Label htmlFor="report-day">Xem 1 ngày trong tháng</Label>
          <Input
            id="report-day"
            type="date"
            min={minDay}
            max={maxDay}
            value={day ?? ''}
            onChange={(event) => onDayChange(event.target.value || null)}
          />
        </div>
        {(day || weekStart) && (
          <Button
            variant="white"
            size="xs"
            onClick={() => {
              onDayChange(null)
              onWeekChange(null)
            }}
          >
            Cả tháng
          </Button>
        )}
      </div>
    </section>
  )
}

function shortDate(value: string): string {
  const [, month, day] = value.split('-')
  return `${day}/${month}`
}

function formatDay(value: string): string {
  const [year, month, day] = value.split('-')
  return `${day}/${month}/${year}`
}
