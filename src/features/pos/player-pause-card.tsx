import { useState } from 'react'
import { Pause, Pencil, Play, Timer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useNow } from '@/hooks/use-now'
import { calcElapsedHMS, formatPausedHMS, pausedSecondsUntil } from './format'
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
  readOnly = false,
  renaming,
  onPause,
  onResume,
  onRename,
}: {
  player: SessionPlayerDTO
  index: number
  startTime: string
  /** Chế độ giám sát: chỉ hiện tên + đồng hồ, không có nút đổi tên/Dừng */
  readOnly?: boolean
  renaming: boolean
  onPause: () => void
  onResume: () => void
  /** Đổi tên người chơi — trả true nếu thành công (thoát editing) */
  onRename: (name: string) => Promise<boolean>
}) {
  const isPaused = !!player.pausedAt
  // Tên được gán cố định từ lúc check-in (createPlayersForGroup). Fallback chỉ
  // dùng cho row cũ trong DB chưa có tên, hoặc user xoá tên về rỗng.
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

  // Đồng hồ dùng chung: một lần tick chỉ re-render đúng hàng người chơi này.
  const now = useNow()

  const elapsed = calcElapsedHMS(
    startTime,
    isPaused ? player.pausedAt ?? undefined : new Date(now),
    player.totalPausedSeconds,
  )

  // Thời gian đã tạm dừng: khi đang paused → tick live từ pausedAt
  const pausedSeconds = pausedSecondsUntil(player.pausedAt, player.totalPausedSeconds, now)
  const hasPaused = pausedSeconds > 0

  const nameClass = isPaused
    ? 'truncate text-sm font-semibold text-warning transition-colors duration-200'
    : 'truncate text-sm font-semibold text-text-primary transition-colors duration-200'

  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      {/* Trái — tên + dòng Nghỉ (reserve chỗ để tránh layout shift khi bấm Dừng) */}
      <div className="flex min-w-0 flex-col gap-0.5">
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
        ) : readOnly ? (
          <p className={nameClass}>{displayName}</p>
        ) : (
          <button
            type="button"
            onClick={startEditing}
            disabled={renaming}
            className="flex min-w-0 items-center gap-1 self-start rounded text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            title="Đổi tên người chơi"
          >
            <p className={nameClass}>
              {displayName}
            </p>
            <Pencil
              size={12}
              className={
                isPaused
                  ? 'shrink-0 text-warning'
                  : 'shrink-0 text-text-tertiary'
              }
            />
          </button>
        )}
        <span
          aria-hidden={!hasPaused}
          className={`inline-flex items-center gap-1 text-xs tabular-nums transition-colors duration-200 ${
            hasPaused
              ? isPaused
                ? 'text-warning'
                : 'text-text-tertiary'
              : 'invisible'
          }`}
        >
          <Timer
            size={11}
            className={
              hasPaused
                ? isPaused
                  ? 'text-warning'
                  : 'text-text-tertiary'
                : ''
            }
          />
          Nghỉ {hasPaused ? formatPausedHMS(pausedSeconds) : '00:00:00'}
        </span>
      </div>

      {/* Phải — timer chính + nút Dừng/Chơi xếp dọc */}
      <div className="flex shrink-0 flex-col items-end gap-2">
        <SessionTimer elapsed={elapsed} isPaused={isPaused} />
        {!readOnly && (isPaused ? (
        <Button variant="contrast" size="xs" onClick={onResume} title="Tiếp tục chơi">
            <Play size={12} className="mr-1" />
            Chơi
          </Button>
        ) : (
        <Button variant="white" size="xs" onClick={onPause} title="Tạm dừng người này">
            <Pause size={12} className="mr-1" />
            Dừng
          </Button>
        ))}
      </div>
    </div>
  )
}
