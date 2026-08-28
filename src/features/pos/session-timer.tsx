import { Timer } from 'lucide-react'

/**
 * Timer thời gian chơi 1 dòng — dùng cho thẻ phiên 1 người và thẻ từng người
 * chơi trong phiên nhiều người. Dòng "Nghỉ HH:MM:SS" được render riêng ở parent
 * (dưới tên người chơi / dưới tên phiên) — không gộp vào đây.
 */
export function SessionTimer({
  elapsed,
  isPaused,
  accent = 'emerald',
}: {
  /** Chuỗi thời gian chơi đã format (HH:MM:SS) */
  elapsed: string
  isPaused: boolean
  /** Màu timer khi đang chạy — hội viên dùng 'purple' */
  accent?: 'emerald' | 'purple'
}) {
  const runningColor = accent === 'purple'
    ? 'text-purple-600 dark:text-purple-400'
    : 'text-emerald-600 dark:text-emerald-400'

  return (
    <span className={`inline-flex items-center gap-1.5 text-base font-semibold tabular-nums ${isPaused ? 'text-amber-600 dark:text-amber-400' : 'text-zinc-950 dark:text-white'}`}>
      <Timer size={18} className={isPaused ? 'text-amber-600 dark:text-amber-400' : runningColor} />
      {elapsed}
    </span>
  )
}
