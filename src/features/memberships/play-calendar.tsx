'use client'

import { useMemo, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { formatVnDate } from '@/lib/shared/utils'
import { buildPlayCalendar, playHoursLabel, type PlayDay } from './play-calendar-data'

const WEEKDAY_LABELS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']
const ROW_LABELS = [...WEEKDAY_LABELS, ...WEEKDAY_LABELS]

const CELL_LEVELS = [
  'bg-surface-tertiary',
  'bg-success/25',
  'bg-success/45',
  'bg-success/70',
  'bg-success',
]

function levelOf(hours: number): number {
  if (hours <= 0) return 0
  if (hours < 1) return 1
  if (hours < 2) return 2
  if (hours < 4) return 3
  return 4
}

interface Props {
  playDays: PlayDay[]
  /** Ngày hôm nay (YYYY-MM-DD) tính ở server để SSR và client không lệch nhau. */
  today: string
}

export function PlayCalendar({ playDays, today }: Props) {
  const currentYear = Number(today.slice(0, 4))
  const [year, setYear] = useState(currentYear)

  const firstYear = useMemo(
    () =>
      playDays.reduce(
        (earliest, entry) => Math.min(earliest, Number(entry.day.slice(0, 4))),
        currentYear,
      ),
    [playDays, currentYear],
  )

  const columns = useMemo(
    () => buildPlayCalendar(playDays, year, today),
    [playDays, year, today],
  )

  const { totalHours, activeDays } = useMemo(() => {
    let hours = 0
    let days = 0
    for (const column of columns) {
      for (const cell of column.cells) {
        if (!cell || cell.future) continue
        hours += cell.hours
        if (cell.hours > 0) days += 1
      }
    }
    return { totalHours: Math.round(hours * 100) / 100, activeDays: days }
  }, [columns])

  const gridTemplateColumns = `1rem repeat(${columns.length}, var(--cell))`

  return (
    <Card padding="none" className="overflow-hidden">
      <header className="flex items-center justify-between gap-2 border-b border-border-default px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <CalendarDays size={15} className="shrink-0 text-text-tertiary" />
          <h2 className="truncate text-sm font-semibold text-text-primary">
            Giờ chơi theo ngày
          </h2>
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <Button
            variant="ghost"
            size="sm"
            icon={ChevronLeft}
            className="h-11 w-11 -my-2"
            aria-label="Năm trước"
            title="Năm trước"
            disabled={year <= firstYear}
            onClick={() => setYear((value) => value - 1)}
          />
          <span className="w-11 text-center text-sm font-semibold tabular-nums text-text-primary">
            {year}
          </span>
          <Button
            variant="ghost"
            size="sm"
            icon={ChevronRight}
            className="h-11 w-11 -my-2"
            aria-label="Năm sau"
            title="Năm sau"
            disabled={year >= currentYear}
            onClick={() => setYear((value) => value + 1)}
          />
        </div>
      </header>

      <div className="px-4 py-3">
        <p className="mb-2 text-xs tabular-nums text-text-tertiary">
          {totalHours.toLocaleString('vi-VN', { maximumFractionDigits: 2 })} giờ ·{' '}
          {activeDays} ngày chơi
        </p>

        <div aria-hidden className="mx-auto w-fit [--cell:0.5rem] sm:[--cell:0.75rem]">
          <div className="grid gap-[2px]" style={{ gridTemplateColumns }}>
            <span aria-hidden />
            {columns.map((column, index) => {
              const monthNumber = column.monthLabel
                ? Number(column.monthLabel.slice(2))
                : null
              const showOnMobile = monthNumber !== null && (monthNumber - 1) % 3 === 0

              return (
                <span
                  key={index}
                  className="overflow-visible whitespace-nowrap text-[10px] leading-3 text-text-tertiary"
                >
                  <span className="sm:hidden">
                    {showOnMobile ? column.monthLabel : ''}
                  </span>
                  <span className="hidden sm:inline">{column.monthLabel ?? ''}</span>
                </span>
              )
            })}
          </div>

          <div
            className="mt-1 grid grid-flow-col gap-[2px]"
            style={{
              gridTemplateColumns,
              gridTemplateRows: 'repeat(14, var(--cell))',
            }}
          >
            {ROW_LABELS.map((label, index) => (
              <span
                key={`${label}-${index}`}
                className="flex items-center justify-end pr-1 text-[10px] leading-none text-text-tertiary"
              >
                {(index % 7) % 2 === 0 ? label : ''}
              </span>
            ))}

            {columns.flatMap((column, columnIndex) =>
              column.cells.map((cell, rowIndex) => {
                if (!cell) {
                  return (
                    <span
                      key={`empty-${columnIndex}-${rowIndex}`}
                      aria-hidden
                      className="aspect-square"
                    />
                  )
                }

                const label = cell.future ? 'Chưa tới' : playHoursLabel(cell.hours)
                return (
                  <span
                    key={cell.day}
                    title={`${formatVnDate(cell.day)} · ${label}`}
                    className={`aspect-square rounded-[2px] ${CELL_LEVELS[levelOf(cell.hours)]}`}
                  />
                )
              }),
            )}
          </div>

          <div className="mt-2 flex items-center justify-end gap-1 text-[10px] text-text-tertiary">
            <span>Ít</span>
            {CELL_LEVELS.map((classes, index) => (
              <span
                key={index}
                className={`size-2 rounded-[2px] ${classes}`}
                aria-hidden
              />
            ))}
            <span>Nhiều</span>
          </div>
        </div>
      </div>
    </Card>
  )
}
