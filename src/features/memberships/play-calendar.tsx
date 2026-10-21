'use client'

import { useMemo, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatVnDate, toInputDate } from '@/lib/shared/utils'
import {
  buildPlayCalendar,
  playHoursLabel,
  type PlayDay,
} from './play-calendar-data'

const WEEKDAY_LABELS = ['T2', '', 'T4', '', 'T6', '', 'CN']

const CELL_LEVELS = [
  'bg-zinc-100 dark:bg-zinc-800',
  'bg-success/25 dark:bg-success/30',
  'bg-success/45 dark:bg-success/50',
  'bg-success/70 dark:bg-success/75',
  'bg-success',
]

const YEAR_NAV_CLASS = 'h-8 w-8'

function levelOf(hours: number): number {
  if (hours <= 0) return 0
  if (hours < 1) return 1
  if (hours < 2) return 2
  if (hours < 4) return 3
  return 4
}

export function PlayCalendar({ playDays }: { playDays: PlayDay[] }) {
  const today = toInputDate(new Date())
  const currentYear = Number(today.slice(0, 4))
  const [year, setYear] = useState(currentYear)

  const firstYear = useMemo(
    () => playDays.reduce(
      (earliest, entry) => Math.min(earliest, Number(entry.day.slice(0, 4))),
      currentYear,
    ),
    [playDays, currentYear],
  )

  const weeks = useMemo(() => buildPlayCalendar(playDays, year, today), [playDays, year, today])

  const { totalHours, activeDays } = useMemo(() => {
    let hours = 0
    let days = 0
    for (const week of weeks) {
      for (const cell of week.cells) {
        if (cell.outside || cell.future) continue
        hours += cell.hours
        if (cell.hours > 0) days += 1
      }
    }
    return { totalHours: Math.round(hours * 100) / 100, activeDays: days }
  }, [weeks])

  return (
    <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <header className="flex items-center justify-between gap-2 border-b border-zinc-200 px-4 py-2.5 dark:border-zinc-800">
        <div className="flex min-w-0 items-center gap-2">
          <CalendarDays size={15} className="shrink-0 text-zinc-400" />
          <h2 className="truncate text-sm font-semibold text-zinc-950 dark:text-white">
            Giờ chơi theo ngày
          </h2>
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <Button
            variant="ghost"
            size="sm"
            icon={ChevronLeft}
            className={YEAR_NAV_CLASS}
            aria-label="Năm trước"
            title="Năm trước"
            disabled={year <= firstYear}
            onClick={() => setYear((value) => value - 1)}
          />
          <span className="w-11 text-center text-sm font-semibold tabular-nums text-zinc-950 dark:text-white">
            {year}
          </span>
          <Button
            variant="ghost"
            size="sm"
            icon={ChevronRight}
            className={YEAR_NAV_CLASS}
            aria-label="Năm sau"
            title="Năm sau"
            disabled={year >= currentYear}
            onClick={() => setYear((value) => value + 1)}
          />
        </div>
      </header>

      <div className="px-4 py-3">
        <p className="mb-2 text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
          {totalHours.toLocaleString('vi-VN', { maximumFractionDigits: 2 })} giờ · {activeDays} ngày chơi
        </p>

        <div className="overflow-x-auto pb-1">
          <div className="w-max">
            <div className="mb-1 flex gap-[2px] pl-5">
              {weeks.map((week, index) => (
                <div key={index} className="relative h-3 w-2 shrink-0">
                  {week.monthLabel && (
                    <span className="absolute left-0 top-0 whitespace-nowrap text-[9px] leading-3 text-zinc-500 dark:text-zinc-400">
                      {week.monthLabel}
                    </span>
                  )}
                </div>
              ))}
            </div>

            <div className="flex gap-[2px]">
              <div className="flex w-5 shrink-0 flex-col gap-[2px] pr-1">
                {WEEKDAY_LABELS.map((label, index) => (
                  <span
                    key={index}
                    className="flex h-2 items-center justify-end text-[9px] leading-none text-zinc-400 dark:text-zinc-500"
                  >
                    {label}
                  </span>
                ))}
              </div>

              {weeks.map((week, weekIndex) => (
                <div key={weekIndex} className="flex shrink-0 flex-col gap-[2px]">
                  {week.cells.map((cell) => {
                    const hidden = cell.outside
                    const label = cell.future ? 'Chưa tới' : playHoursLabel(cell.hours)
                    return (
                      <span
                        key={cell.day}
                        title={hidden ? undefined : `${formatVnDate(cell.day)} · ${label}`}
                        aria-label={hidden ? undefined : `${formatVnDate(cell.day)}: ${label}`}
                        aria-hidden={hidden || undefined}
                        className={`size-2 rounded-[2px] ${
                          hidden ? 'invisible' : CELL_LEVELS[levelOf(cell.hours)]
                        }`}
                      />
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-2 flex items-center justify-end gap-1 text-[10px] text-zinc-500 dark:text-zinc-400">
          <span>Ít</span>
          {CELL_LEVELS.map((classes, index) => (
            <span key={index} className={`size-2 rounded-[2px] ${classes}`} aria-hidden />
          ))}
          <span>Nhiều</span>
        </div>
      </div>
    </section>
  )
}
