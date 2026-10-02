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
  /** Màu timer khi đang chạy — hội viên dùng 'yellow' */
  accent?: 'emerald' | 'yellow'
}) {
  const runningColor = accent === 'yellow'
  ? 'text-yellow-dark'
  : 'text-success'

  return (
  <span className={`inline-flex items-center gap-1.5 text-base font-semibold tabular-nums ${isPaused ? 'text-warning' : 'text-text-primary'}`}>
<Timer size={18} className={isPaused ? 'text-warning' : runningColor} />
      {elapsed}
    </span>
  )
}
