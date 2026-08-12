import { useState } from 'react'
import { Pencil, Pause, Play } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { calcElapsedHMS, pausedSecondsUntil } from './format'
import { SessionTimer } from './session-timer'
import type { SessionPlayerDTO } from '@/types'

/**
 * Thẻ 1 người chơi trong phiên nhiều người — timer + nút Dừng/Chơi riêng.
 * Tên trống → tự đánh số "Người N" theo thứ tự trong group.
 * Bấm vào tên (hoặc nút bút chì) → đổi tên inline theo đúng `player.id`.
 */
export function PlayerPauseCard({
  player,
  index,
  startTime,
  pauseDisabled,
  renaming,
  onPause,
  onResume,
  onRename,
}: {
  player: SessionPlayerDTO
  index: number
  startTime: string
  pauseDisabled: boolean
  renaming: boolean
  onPause: () => void
  onResume: () => void
  /** Đổi tên người chơi — trả true nếu thành công (thoát editing) */
  onRename: (name: string) => Promise<boolean>
}) {
  const isPaused = !!player.pausedAt
  const displayName = player.name?.trim() || `Người ${index + 1}`

  const [editing, setEditing] = useState(false)
  const [draftName, setDraftName] = useState('')

  const startEditing = () => {
    if (renaming) return
    setDraftName(player.name?.trim() || '')
    setEditing(true)
  }

  const commitRename = async () => {
    if (renaming) return
    const name = draftName.trim()
    // Không đổi gì → chỉ thoát editing
    if (name === (player.name?.trim() ?? '')) {
      setEditing(false)
      return
    }
    const ok = await onRename(name)
    if (ok) setEditing(false)
  }

  const elapsed = isPaused
    ? calcElapsedHMS(startTime, player.pausedAt ?? undefined, player.totalPausedSeconds)
    : calcElapsedHMS(startTime, undefined, player.totalPausedSeconds)

  // Thời gian đã tạm dừng: khi đang paused → tick live từ pausedAt
  const pausedSeconds = pausedSecondsUntil(player.pausedAt, player.totalPausedSeconds)

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {editing ? (
            <Input
              autoFocus
              value={draftName}
              maxLength={100}
              placeholder={`Người ${index + 1}`}
              className="h-7 w-40 px-2 py-1 text-sm"
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void commitRename()
                if (e.key === 'Escape') setEditing(false)
              }}
              onBlur={() => void commitRename()}
            />
          ) : (
            <button
              type="button"
              onClick={startEditing}
              disabled={renaming}
              className="flex min-w-0 items-center gap-1 rounded text-left"
              title="Đổi tên người chơi"
            >
              <p className="truncate text-sm font-semibold text-zinc-950 dark:text-white">
                {displayName}
              </p>
              <Pencil size={12} className="shrink-0 text-zinc-400" />
            </button>
          )}
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
