import { Timer } from 'lucide-react'
import { formatPausedHMS } from './format'

/**
 * Bộ đếm thời gian chơi + đã tạm dừng — dùng chung cho:
 * - Thẻ phiên 1 người (ActiveSessionCard)
 * - Thẻ từng người chơi trong phiên nhiều người (PlayerPauseCard)
 * Hiển thị xếp dọc: timer thời gian chơi trước, thời gian đã tạm dừng bên dưới.
 * Căn phải (items-end) để khớp vị trí timer của thẻ phiên 1 người.
 */
export function SessionTimer({
  elapsed,
  pausedSeconds,
  isPaused,
  accent = 'emerald',
}: {
  /** Chuỗi thời gian chơi đã format (HH:MM:SS) */
  elapsed: string
  /** Số giây đã tạm dừng — 0 thì không hiển thị dòng paused */
  pausedSeconds: number
  isPaused: boolean
  /** Màu timer khi đang chạy — hội viên dùng 'purple' */
  accent?: 'emerald' | 'purple'
}) {
  const runningColor = accent === 'purple'
    ? 'text-purple-600 dark:text-purple-400'
    : 'text-emerald-600 dark:text-emerald-400'

  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className={`inline-flex items-center gap-1.5 text-sm font-semibold tabular-nums ${isPaused ? 'text-amber-600 dark:text-amber-400' : 'text-zinc-950 dark:text-white'}`}>
        <Timer size={15} className={isPaused ? 'text-amber-600 dark:text-amber-400' : runningColor} />
        {elapsed}
      </span>
      {pausedSeconds > 0 && (
        <span className={`inline-flex items-center gap-1 text-xs tabular-nums ${isPaused ? 'text-amber-600 dark:text-amber-400' : 'text-zinc-500 dark:text-zinc-400'}`}>
          <Timer size={12} className={isPaused ? 'text-amber-600 dark:text-amber-400' : 'text-zinc-400 dark:text-zinc-500'} />
          Đã tạm dừng {formatPausedHMS(pausedSeconds)}
        </span>
      )}
    </div>
  )
}
