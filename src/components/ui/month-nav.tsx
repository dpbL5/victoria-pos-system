'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'

interface MonthNavProps {
  /** Nhãn đang chọn, vd "Tháng 10/2026". */
  label: string
  /** Nhãn nhỏ phía trên. Mặc định "Khoảng thời gian". */
  eyebrow?: string
  loading?: boolean
  onPrev: () => void
  onNext: () => void
  /** Cho phép tới tháng sau? (thường = chưa phải tháng hiện tại) */
  canGoNext?: boolean
}

const NAV_BUTTON_CLASS =
  'inline-flex h-9 w-9 items-center justify-center rounded-lg bg-white text-zinc-600 ring-1 ring-zinc-200 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-900 dark:text-zinc-300 dark:ring-zinc-800 dark:hover:bg-zinc-800'

/**
 * Dải chuyển tháng dùng chung (Báo cáo, Thu chi...). Chỉ render hàng tiêu đề +
 * nút ‹ ›; khung <section> do màn gọi tự bọc để đồng nhất bố cục từng màn.
 */
export function MonthNav({ label, eyebrow = 'Khoảng thời gian', loading, onPrev, onNext, canGoNext = true }: MonthNavProps) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          {eyebrow}
        </p>
        <p className="mt-0.5 text-sm font-semibold text-zinc-950 dark:text-white">
          {label}
          {loading && <span className="ml-2 text-xs font-normal text-zinc-400">Đang tải…</span>}
        </p>
      </div>
      <div className="flex items-center gap-1.5">
        <button type="button" aria-label="Tháng trước" onClick={onPrev} className={NAV_BUTTON_CLASS}>
          <ChevronLeft size={18} />
        </button>
        <button type="button" aria-label="Tháng sau" onClick={onNext} disabled={!canGoNext} className={NAV_BUTTON_CLASS}>
          <ChevronRight size={18} />
        </button>
      </div>
    </div>
  )
}
