import { useState } from 'react'
import { ChevronDown, ChevronUp, Clock, LogIn, Pause, Play } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { calcElapsedHMS, formatClock, money, pausedSecondsUntil, toNumber } from './format'
import { PlayerPauseCard } from './player-pause-card'
import { SessionTimer } from './session-timer'
import type { SessionRow } from './types'

export function ActiveSessionCard({
  session,
  checkoutDisabled,
  pauseDisabled,
  onCheckout,
  onPause,
  onResume,
  onPausePlayer,
  onResumePlayer,
}: {
  session: SessionRow
  checkoutDisabled: boolean
  pauseDisabled: boolean
  onCheckout: () => void
  onPause: () => void
  onResume: () => void
  /** Pause theo từng người chơi (phiên nhiều người) */
  onPausePlayer?: (playerId: string) => void
  onResumePlayer?: (playerId: string) => void
}) {
  const isMember = session.customer?.type === 'MEMBER' || !!session.membership
  const playerCount = session.playerCount ?? 1
  const isGroup = playerCount > 1
  const isPaused = !!session.pausedAt
  const pendingSell = toNumber(session.pendingSellTotal ?? 0)

  // Phiên nhiều người CÓ player rows → mỗi người 1 thẻ riêng (pause per-player)
  const hasPlayers = isGroup && (session.pricingGroups?.some((g) => (g.players?.length ?? 0) > 0) ?? false)

  // Thu gọn bảng người chơi (chỉ phiên nhóm) — collapse mặc định khi có nhiều người
  const [collapsed, setCollapsed] = useState(isGroup)
  const toggleCollapsed = () => setCollapsed((value) => !value)

  const elapsed = isPaused
    ? calcElapsedHMS(session.startTime, session.pausedAt ?? undefined, session.totalPausedSeconds ?? 0)
    : calcElapsedHMS(session.startTime, undefined, session.totalPausedSeconds ?? 0)

  // Thời gian đã tạm dừng (phiên 1 người / legacy): khi đang paused → tick live từ pausedAt
  const pausedSeconds = pausedSecondsUntil(session.pausedAt, session.totalPausedSeconds ?? 0)

  return (
    <div className="px-4 py-3">
      <div className="grid grid-cols-[1fr_auto] gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold text-zinc-950 dark:text-white">
              {session.customerName ?? session.customer?.fullName ?? 'Khách lẻ'}
            </p>
            {isMember && (
              <Badge variant="purple" size="sm">
                Hội viên
              </Badge>
            )}
            {isPaused && !hasPlayers && (
              <Badge variant="warning" size="sm">
                Tạm dừng
              </Badge>
            )}
            {isGroup && (
              <Badge variant="outline" size="sm">
                {playerCount} người
              </Badge>
            )}
            {hasPlayers && (
              <button
                type="button"
                onClick={toggleCollapsed}
                className="ml-1 shrink-0 rounded-lg p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
                title={collapsed ? 'Mở rộng bảng người chơi' : 'Thu gọn bảng người chơi'}
              >
                {collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
              </button>
            )}
          </div>
          <div className="mt-2 space-y-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            <p className="flex items-center gap-1.5">
              <Clock size={12} className="shrink-0" />
              {session.shift ? `Ca ${formatClock(session.shift.openedAt)}` : 'Chưa gắn ca'}
            </p>
            <p className="flex items-center gap-1.5">
              <LogIn size={12} className="shrink-0" />
              Check-in {formatClock(session.startTime)}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end justify-between gap-2">
          {!hasPlayers && (
            <SessionTimer
              elapsed={elapsed}
              pausedSeconds={pausedSeconds}
              isPaused={isPaused}
              accent={isMember ? 'purple' : 'emerald'}
            />
          )}
          <div className="flex items-center gap-2">
            {pendingSell > 0 && (
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                Tạm tính: <span className="font-semibold tabular-nums text-zinc-950 dark:text-white">{money(pendingSell)}</span>
              </span>
            )}
            {!hasPlayers && (isPaused ? (
              <Button variant="inverse" size="xs" disabled={pauseDisabled} onClick={onResume} title="Tiếp tục chơi">
                <Play size={12} className="mr-1" />
                Chơi
              </Button>
            ) : (
              <Button variant="secondary" size="xs" disabled={pauseDisabled} onClick={onPause} title="Tạm dừng">
                <Pause size={12} className="mr-1" />
                Dừng
              </Button>
            ))}
            <Button variant="inverse" size="xs" disabled={checkoutDisabled} onClick={onCheckout}>
              Thu
            </Button>
          </div>
        </div>
      </div>

      {/* Phiên nhiều người → thẻ từng người chơi với timer + pause riêng (thu gọn được) */}
      {hasPlayers && !collapsed && (
        <div className="mt-3 space-y-2">
          {session.pricingGroups!
            .filter((g) => g.remainingCount > 0)
            .map((group) => {
              const players = group.players ?? []
              return players.map((player, index) => (
                <PlayerPauseCard
                  key={player.id}
                  player={player}
                  index={index}
                  startTime={session.startTime}
                  pauseDisabled={pauseDisabled}
                  onPause={() => onPausePlayer?.(player.id)}
                  onResume={() => onResumePlayer?.(player.id)}
                />
              ))
            })}
        </div>
      )}
    </div>
  )
}
