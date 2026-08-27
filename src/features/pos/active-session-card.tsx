import { useState } from 'react'
import { ChevronDown, ChevronUp, LogIn, Pause, Play, Timer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { calcElapsedHMS, formatClock, formatPausedHMS, money, pausedSecondsUntil, toNumber } from './format'
import { PlayerPauseCard } from './player-pause-card'
import { SessionTimer } from './session-timer'
import type { SessionRow } from './types'

export function ActiveSessionCard({
  session,
  checkoutDisabled,
  pauseDisabled,
  /** Vị trí trong danh sách — dùng stagger cho entry animation */
  index = 0,
  onCheckout,
  onPause,
  onResume,
  onPausePlayer,
  onResumePlayer,
  onRenamePlayer,
}: {
  session: SessionRow
  checkoutDisabled: boolean
  pauseDisabled: boolean
  index?: number
  onCheckout: () => void
  onPause: () => void
  onResume: () => void
  /** Pause theo từng người chơi (phiên nhiều người) */
  onPausePlayer?: (playerId: string) => void
  onResumePlayer?: (playerId: string) => void
  /** Đổi tên 1 người chơi — trả true nếu thành công */
  onRenamePlayer?: (playerId: string, name: string) => Promise<boolean>
}) {
  const isMember = session.customer?.type === 'MEMBER' || !!session.membership
  const playerCount = session.playerCount ?? 1
  const isGroup = playerCount > 1
  const isPaused = !!session.pausedAt
  const pendingSell = toNumber(session.pendingSellTotal ?? 0)

  // Phiên nhiều người → bảng người chơi expand/collapse bên dưới.
  // Phiên 1 người → KHÔNG dùng expandable group (dù check-in có tạo 1 player row,
  // ta vẫn render thẳng lên card cha để gọn — đỡ phải bấm mở rồi xem 1 dòng).
  const hasGroupPlayers =
    isGroup && (session.pricingGroups?.some((g) => (g.players?.length ?? 0) > 0) ?? false)

  // Thu gọn bảng người chơi — chỉ áp dụng cho phiên nhiều người
  const [collapsed, setCollapsed] = useState(isGroup)
  const toggleCollapsed = () => setCollapsed((value) => !value)

  // Đang đổi tên 1 người chơi — disable để tránh bấm nhầm / submit lồng nhau
  const [renaming, setRenaming] = useState(false)

  const elapsed = isPaused
    ? calcElapsedHMS(session.startTime, session.pausedAt ?? undefined, session.totalPausedSeconds ?? 0)
    : calcElapsedHMS(session.startTime, undefined, session.totalPausedSeconds ?? 0)

  // Thời gian đã tạm dừng (phiên 1 người / legacy): khi đang paused → tick live từ pausedAt
  const pausedSeconds = pausedSecondsUntil(session.pausedAt, session.totalPausedSeconds ?? 0)
  const hasPausedSeconds = pausedSeconds > 0

  return (
    <div
      className="animate-card-enter px-3 py-2.5 transition-colors hover:bg-zinc-50/70 sm:px-4 sm:py-3 dark:hover:bg-zinc-900/40"
      style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}
    >
      <div className="flex items-start justify-between gap-2">
        {/* Trái — tên + meta (hàng 1) + dòng Nghỉ (hàng 2, dưới tên) */}
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p
              className={
                isPaused
                  ? 'truncate text-base font-semibold text-amber-600 dark:text-amber-400'
                  : isMember
                    ? 'truncate text-base font-semibold text-purple-600 dark:text-purple-400'
                    : 'truncate text-base font-semibold text-zinc-950 dark:text-white'
              }
            >
              {session.customerName ?? session.customer?.fullName ?? 'Khách lẻ'}
            </p>
            <span className="inline-flex items-center gap-1 text-[11px] text-zinc-500 dark:text-zinc-400">
              <LogIn size={11} className="shrink-0" />
              {formatClock(session.startTime)}
            </span>
            {pendingSell > 0 && (
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                · Tạm tính{' '}
                <span className="font-semibold tabular-nums text-zinc-950 dark:text-white">
                  {money(pendingSell)}
                </span>
              </span>
            )}
          </div>
          {!isGroup && (
            <span
              aria-hidden={!hasPausedSeconds}
              className={`inline-flex items-center gap-1 text-xs tabular-nums ${
                hasPausedSeconds
                  ? isPaused
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-zinc-500 dark:text-zinc-400'
                  : 'invisible'
              }`}
            >
              <Timer
                size={11}
                className={
                  hasPausedSeconds
                    ? isPaused
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-zinc-400 dark:text-zinc-500'
                    : ''
                }
              />
              Nghỉ {hasPausedSeconds ? formatPausedHMS(pausedSeconds) : '00:00:00'}
            </span>
          )}
        </div>

        {/* Phải — timer chính + nút Dừng/Chơi + Thu xếp dọc, căn phải */}
        <div className="flex shrink-0 flex-col items-end gap-2">
          {!isGroup ? (
            <SessionTimer
              elapsed={elapsed}
              isPaused={isPaused}
              accent={isMember ? 'purple' : 'emerald'}
            />
          ) : (
            <button
              type="button"
              onClick={toggleCollapsed}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
              title={collapsed ? 'Mở rộng bảng người chơi' : 'Thu gọn bảng người chơi'}
            >
              {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
              {collapsed ? `Mở ${playerCount} người chơi` : 'Thu gọn'}
            </button>
          )}
          {!isGroup && (
            <div className="flex items-center gap-1.5">
              {isPaused ? (
                <Button
                  variant="inverse"
                  size="sm"
                  disabled={pauseDisabled}
                  onClick={onResume}
                  title="Tiếp tục chơi"
                  className="px-2.5 md:px-3"
                >
                  <Play size={14} className="mr-1" />
                  <span className="hidden sm:inline">Chơi</span>
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={pauseDisabled}
                  onClick={onPause}
                  title="Tạm dừng"
                  className="px-2.5 md:px-3"
                >
                  <Pause size={14} className="mr-1" />
                  <span className="hidden sm:inline">Dừng</span>
                </Button>
              )}
              <Button
                variant="inverse"
                size="sm"
                disabled={checkoutDisabled}
                onClick={onCheckout}
                className="px-3 transition-transform active:scale-[0.97] md:px-4"
              >
                Thu
              </Button>
            </div>
          )}
          {isGroup && (
            <Button
              variant="inverse"
              size="sm"
              disabled={checkoutDisabled}
              onClick={onCheckout}
              className="px-3 transition-transform active:scale-[0.97] md:px-4"
            >
              Thu
            </Button>
          )}
        </div>
      </div>

      {/* Phiên nhiều người có player rows → danh sách thẻ từng người chơi với timer + pause riêng.
          Container luôn render để animate enter/exit bằng grid-rows; phần nội dung
          collapse xuống 0px khi đóng. Phiên 1 người KHÔNG vào nhánh này. */}
      {hasGroupPlayers && (
        <div
          className="grid transition-[grid-template-rows,opacity] duration-200 ease-out"
          style={{
            gridTemplateRows: collapsed ? '0fr' : '1fr',
            opacity: collapsed ? 0 : 1,
          }}
          aria-hidden={collapsed}
        >
          <div className="overflow-hidden">
            <div className="mt-3 space-y-2">
              {session.pricingGroups!
                .filter((g) => g.remainingCount > 0)
                .map((group) => {
                  // Lọc người đã được thu trước (checkedOutAt) — không hiển thị thẻ pause nữa
                  const players = (group.players ?? []).filter((p) => !p.checkedOutAt)
                  return players.map((player, index) => (
                    <PlayerPauseCard
                      key={player.id}
                      player={player}
                      index={index}
                      startTime={session.startTime}
                      pauseDisabled={pauseDisabled}
                      renaming={renaming}
                      onPause={() => onPausePlayer?.(player.id)}
                      onResume={() => onResumePlayer?.(player.id)}
                      onRename={async (name) => {
                        if (!onRenamePlayer) return false
                        setRenaming(true)
                        try {
                          return await onRenamePlayer(player.id, name)
                        } finally {
                          setRenaming(false)
                        }
                      }}
                    />
                  ))
                })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
