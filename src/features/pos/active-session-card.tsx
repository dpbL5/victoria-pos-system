import { Pause, Play, Timer } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { calcElapsedHMS, formatClock, money, toNumber } from './format'
import type { SessionRow } from './types'

export function ActiveSessionCard({
  session,
  checkoutDisabled,
  pauseDisabled,
  onCheckout,
  onPause,
  onResume,
}: {
  session: SessionRow
  checkoutDisabled: boolean
  pauseDisabled: boolean
  onCheckout: () => void
  onPause: () => void
  onResume: () => void
}) {
  const isMember = session.customer?.type === 'MEMBER' || !!session.membership
  const playerCount = session.playerCount ?? 1
  const isGroup = playerCount > 1
  const isPaused = !!session.pausedAt
  const pendingSell = toNumber(session.pendingSellTotal ?? 0)

  const elapsed = isPaused
    ? calcElapsedHMS(session.startTime, session.pausedAt ?? undefined, session.totalPausedSeconds ?? 0)
    : calcElapsedHMS(session.startTime, undefined, session.totalPausedSeconds ?? 0)

  return (
    <div className="grid grid-cols-[1fr_auto] gap-3 px-4 py-3">
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
          {isPaused && (
            <Badge variant="warning" size="sm">
              Tạm dừng
            </Badge>
          )}
          {isGroup && (
            <Badge variant="outline" size="sm">
              {playerCount} người
            </Badge>
          )}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
          <span>{formatClock(session.startTime)}</span>
          {session.shift ? <span>Ca {formatClock(session.shift.openedAt)}</span> : <span>Chưa gắn ca</span>}
        </div>
      </div>
      <div className="flex flex-col items-end justify-between gap-2">
        <span className={`inline-flex items-center gap-1.5 text-sm font-semibold tabular-nums ${isPaused ? 'text-amber-600 dark:text-amber-400' : 'text-zinc-950 dark:text-white'}`}>
          <Timer size={15} className={isPaused ? 'text-amber-600 dark:text-amber-400' : isMember ? 'text-purple-600 dark:text-purple-400' : 'text-emerald-600 dark:text-emerald-400'} />
          {elapsed}
        </span>
        <div className="flex items-center gap-2">
          {pendingSell > 0 && (
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              Tạm tính: <span className="font-semibold tabular-nums text-zinc-950 dark:text-white">{money(pendingSell)}</span>
            </span>
          )}
          {isPaused ? (
            <Button variant="inverse" size="xs" disabled={pauseDisabled} onClick={onResume} title="Tiếp tục chơi">
              <Play size={12} className="mr-1" />
              Chơi
            </Button>
          ) : (
            <Button variant="secondary" size="xs" disabled={pauseDisabled} onClick={onPause} title="Tạm dừng">
              <Pause size={12} className="mr-1" />
              Dừng
            </Button>
          )}
          <Button variant="inverse" size="xs" disabled={checkoutDisabled} onClick={onCheckout}>
            Thu
          </Button>
        </div>
      </div>
    </div>
  )
}
