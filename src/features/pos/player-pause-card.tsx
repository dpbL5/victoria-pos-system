import { Pause, Play } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { calcElapsedHMS, pausedSecondsUntil } from './format'
import { SessionTimer } from './session-timer'
import type { SessionPlayerDTO } from '@/types'

/**
 * Thẻ 1 người chơi trong phiên nhiều người — timer + nút Dừng/Chơi riêng.
 * Tên trống → tự đánh số "Người N" theo thứ tự trong group.
 */
export function PlayerPauseCard({
  player,
  index,
  startTime,
  pauseDisabled,
  onPause,
  onResume,
}: {
  player: SessionPlayerDTO
  index: number
  startTime: string
  pauseDisabled: boolean
  onPause: () => void
  onResume: () => void
}) {
  const isPaused = !!player.pausedAt
  const displayName = player.name?.trim() || `Người ${index + 1}`

  const elapsed = isPaused
    ? calcElapsedHMS(startTime, player.pausedAt ?? undefined, player.totalPausedSeconds)
    : calcElapsedHMS(startTime, undefined, player.totalPausedSeconds)

  // Thời gian đã tạm dừng: khi đang paused → tick live từ pausedAt
  const pausedSeconds = pausedSecondsUntil(player.pausedAt, player.totalPausedSeconds)

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold text-zinc-950 dark:text-white">
            {displayName}
          </p>
          {isPaused && (
            <Badge variant="warning" size="sm">
              Tạm dừng
            </Badge>
          )}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2">
        <SessionTimer
          elapsed={elapsed}
          pausedSeconds={pausedSeconds}
          isPaused={isPaused}
        />
        {isPaused ? (
          <Button variant="inverse" size="xs" disabled={pauseDisabled} onClick={onResume} title="Tiếp tục chơi">
            <Play size={12} className="mr-1" />
            Chơi
          </Button>
        ) : (
          <Button variant="secondary" size="xs" disabled={pauseDisabled} onClick={onPause} title="Tạm dừng người này">
            <Pause size={12} className="mr-1" />
            Dừng
          </Button>
        )}
      </div>
    </div>
  )
}
