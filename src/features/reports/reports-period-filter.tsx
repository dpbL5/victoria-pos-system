'use client'

import { ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'

export type ReportsPeriod = 'today' | 'week' | 'month' | 'year'

const PERIODS: Array<{ key: ReportsPeriod; label: string }> = [
  { key: 'today', label: 'Hôm nay' },
  { key: 'week', label: 'Tuần này' },
  { key: 'month', label: 'Tháng này' },
  { key: 'year', label: 'Năm này' },
]

interface ReportsPeriodFilterProps {
  from: string
  to: string
  period: ReportsPeriod | null
  loading: boolean
  onPeriodChange: (period: ReportsPeriod) => void
  onFromChange: (value: string) => void
  onToChange: (value: string) => void
  onApply: () => void
}

export function ReportsPeriodFilter({
  from,
  to,
  period,
  loading,
  onPeriodChange,
  onFromChange,
  onToChange,
  onApply,
}: ReportsPeriodFilterProps) {
  const periodLabel = period
    ? PERIODS.find((item) => item.key === period)!.label
    : `${formatDate(from)} – ${formatDate(to)}`

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Khoảng thời gian
          </p>
          <p className="mt-0.5 text-sm font-semibold text-zinc-950 dark:text-white">
            {periodLabel}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {PERIODS.map((item) => (
            <button
              key={item.key}
              type="button"
              aria-pressed={period === item.key}
              onClick={() => onPeriodChange(item.key)}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                period === item.key
                ? 'bg-info text-white'
                  : 'bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50 dark:bg-zinc-900 dark:text-zinc-300 dark:ring-zinc-800 dark:hover:bg-zinc-800'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <details className="group mt-3">
      <summary className="flex cursor-pointer items-center gap-1 text-xs font-medium text-info [&::-webkit-details-marker]:hidden text-info">
          <span>Tuỳ chỉnh ngày</span>
          <ChevronRight size={12} className="transition-transform group-open:rotate-90" />
        </summary>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="report-from">Từ ngày</Label>
            <Input
              id="report-from"
              type="date"
              value={from}
              onChange={(event) => onFromChange(event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="report-to">Đến ngày</Label>
            <Input
              id="report-to"
              type="date"
              value={to}
              onChange={(event) => onToChange(event.target.value)}
            />
          </div>
        </div>
        <div className="mt-3 flex justify-end">
        <Button variant="blue" size="xs" disabled={loading} onClick={onApply}>
            {loading ? 'Đang tải' : 'Xem'}
          </Button>
        </div>
      </details>
    </section>
  )
}

function formatDate(value: string): string {
  return value ? `${value.slice(8, 10)}/${value.slice(5, 7)}` : '—'
}
