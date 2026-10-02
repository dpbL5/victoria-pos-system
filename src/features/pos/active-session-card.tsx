import { useState } from 'react'
import { ChevronDown, LogIn, Pause, Phone, Play, Timer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useNow } from '@/hooks/use-now'
import { calcElapsedHMS, formatClock, formatPausedHMS, money, pausedSecondsUntil, sessionDayLabel, toNumber } from './format'
import { PlayerPauseCard } from './player-pause-card'
import { SessionTimer } from './session-timer'
import type { SessionRow } from './types'

export function ActiveSessionCard({
  session,
  /** Chế độ giám sát (ADMIN/MANAGER chưa vào ca): chỉ đọc, không render nút */
  readOnly = false,
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
  readOnly?: boolean
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

  // Phiên nhiều người → danh sách người chơi expand/collapse bên dưới.
  // Phiên 1 người → KHÔNG dùng expandable group (dù check-in có tạo 1 player row,
  // ta vẫn render thẳng lên card cha để gọn — đỡ phải bấm mở rồi xem 1 dòng).
  // Danh sách để phẳng — không lồng card trong card — và đã lọc người thu trước.
  const groupPlayers = isGroup
    ? (session.pricingGroups ?? [])
      .filter((group) => group.remainingCount > 0)
      .flatMap((group) => (group.players ?? []).filter((player) => !player.checkedOutAt))
    : []
  const hasGroupPlayers = groupPlayers.length > 0
  // Panel nhóm mặc định THU GỌN: nếu không đếm ở đây thì trạng thái "có người
  // đang nghỉ" vô hình ở đúng trạng thái mặc định của phiên nhiều người.
  const pausedPlayers = groupPlayers.filter((player) => player.pausedAt).length

  // Thu gọn bảng người chơi — chỉ áp dụng cho phiên nhiều người
  const [collapsed, setCollapsed] = useState(isGroup)
  const toggleCollapsed = () => setCollapsed((value) => !value)

  // Đang đổi tên 1 người chơi — disable để tránh bấm nhầm / submit lồng nhau
  const [renaming, setRenaming] = useState(false)

  // Đồng hồ dùng chung: một lần tick chỉ re-render thẻ này, không phải cả màn.
  const now = useNow()
  const dayLabel = sessionDayLabel(session.startTime, now)

  const elapsed = calcElapsedHMS(
    session.startTime,
    isPaused ? session.pausedAt ?? undefined : new Date(now),
    session.totalPausedSeconds ?? 0,
  )

  // Thời gian đã tạm dừng (phiên 1 người / legacy): khi đang paused → tick live từ pausedAt
  const pausedSeconds = pausedSecondsUntil(session.pausedAt, session.totalPausedSeconds ?? 0, now)
  const hasPausedSeconds = pausedSeconds > 0

  // Thu trước: số người còn lại chưa thu so với tổng số người của phiên.
  // Hoà cọc chưa thu cũng nằm trong cùng tín hiệu này — đây là thứ nhân viên
  // phải thấy trước khi bấm Thu, nên nó nằm trên card chứ không nằm trong drawer.
  const remaining = session.pricingGroups?.length
    ? session.pricingGroups.reduce((count, group) => count + group.remainingCount, 0)
    : playerCount
  const settled = Math.max(0, playerCount - remaining)

  const nameClass = isPaused
    ? 'truncate text-sm font-semibold text-warning transition-colors duration-200'
    : 'truncate text-sm font-semibold text-text-primary transition-colors duration-200'

  return (
    <div
      className="animate-card-enter px-4 py-3 transition-colors hover:bg-surface-tertiary"
      style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}
    >
      <div className="flex items-start justify-between gap-3">
        {/* Trái — tên + meta (hàng 1) + dòng Nghỉ (hàng 2, dưới tên) */}
        <div className="flex min-w-0 flex-col gap-2">
          <p className={nameClass}>
            {session.customerName ?? session.customer?.fullName ?? 'Khách lẻ'}
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            {/* Hội viên: vàng là hình (chấm), không bao giờ là chữ — #ffd444 trên
                nền sáng chỉ đạt 1,43:1. Chữ "Hội viên" giữ màu ink cho đủ tương phản. */}
            {isMember && (
              <span className="inline-flex items-center gap-1 text-xs text-text-secondary">
                <span className="size-1.5 shrink-0 rounded-full bg-yellow" aria-hidden />
                Hội viên
              </span>
            )}
            {/* Phiên sót lại từ hôm trước trông y hệt phiên vừa mở nếu chỉ in
                giờ — nhãn ngày là tín hiệu duy nhất phân biệt được, nên nó đi
                kèm giờ bắt đầu và đổi sang màu cảnh báo. */}
            <span
              className={`inline-flex items-center gap-1 text-xs tabular-nums ${dayLabel ? 'font-medium text-warning' : 'text-text-tertiary'}`}
            >
              <LogIn size={12} className="shrink-0" />
              {dayLabel ? `${dayLabel} ${formatClock(session.startTime)}` : formatClock(session.startTime)}
            </span>
            {settled > 0 && (
              <span className="text-xs tabular-nums text-text-tertiary">
                Đã thu <span className="font-semibold text-text-primary">{settled}/{playerCount}</span> người
              </span>
            )}
            {session.customerPhone && (
              <a
                href={`tel:${session.customerPhone}`}
                className="inline-flex items-center gap-1 text-xs text-text-tertiary underline-offset-2 transition-colors hover:text-text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-focus-ring"
                aria-label={`Gọi ${session.customerPhone}`}
              >
                <Phone size={12} className="shrink-0" />
                {session.customerPhone}
              </a>
            )}
            {pendingSell > 0 && (
              <span className="text-xs text-text-tertiary">
                Tạm tính{' '}
                <span className="font-semibold tabular-nums text-text-primary">
                  {money(pendingSell)}
                </span>
              </span>
            )}
          </div>
          {!isGroup && (
            <span
              aria-hidden={!hasPausedSeconds}
              className={`inline-flex items-center gap-1 text-xs tabular-nums transition-colors duration-200 ${hasPausedSeconds
                ? isPaused
                  ? 'text-warning'
                  : 'text-text-tertiary'
                : 'invisible'
                }`}
            >
              <Timer
                size={11}
                className={hasPausedSeconds ? (isPaused ? 'text-warning' : 'text-text-tertiary') : ''}
              />
              Nghỉ {hasPausedSeconds ? formatPausedHMS(pausedSeconds) : '00:00:00'}
            </span>
          )}
        </div>

        {/* Phải — đồng hồ + Dừng/Chơi + Thu, xếp dọc, căn phải.
            Phiên NHÓM cố tình KHÔNG có đồng hồ ở cấp card: `elapsed` của phiên
            là thời gian trôi qua kể từ lúc bắt đầu, không phải thời gian tính
            tiền của bất kỳ người nào (mỗi người pause/resume riêng), nên đặt nó
            cạnh nút Thu rất dễ bị đọc thành số phải thu. Đồng hồ đúng của phiên
            nhóm nằm ở từng người chơi trong panel bên dưới. */}
        <div className="flex min-w-0 shrink-0 flex-col items-end gap-1.5">
          {!isGroup && (
            <SessionTimer
              elapsed={elapsed}
              isPaused={isPaused}
              accent={isMember ? 'yellow' : 'emerald'}
            />
          )}
          {pausedPlayers > 0 && (
            <span className="text-xs font-medium text-warning">
              {pausedPlayers} đang nghỉ
            </span>
          )}
          {isGroup && (
            <Button
              variant="ghost"
              size="xs"
              onClick={toggleCollapsed}
              className="shrink-0"
              title={collapsed ? 'Mở rộng bảng người chơi' : 'Thu gọn bảng người chơi'}
            >
              <ChevronDown
                size={14}
                className={`transition-transform duration-200 ${collapsed ? '' : 'rotate-180'}`}
              />
              {collapsed ? `Mở ${playerCount} người chơi` : 'Thu gọn'}
            </Button>
          )}
          {!readOnly && (
            <div className="flex min-w-0 flex-nowrap items-center gap-1.5">
              {!isGroup && (isPaused ? (
                <Button
                  variant="contrast"
                  size="sm"
                  onClick={onResume}
                  title="Tiếp tục chơi"
                  className="flex flex-row px-3"
                >
                  <Play size={14} />
                  Chơi
                </Button>
              ) : (
                <Button
                  variant="white"
                  size="sm"
                  onClick={onPause}
                  title="Tạm dừng"
                  className="px-3"
                >
                  <Pause size={14} className="shrink-0" />
                  Dừng
                </Button>
              ))}
              <Button
                variant="contrast"
                size="sm"
                onClick={onCheckout}
                className="px-3 md:px-4"
              >
                Thu
              </Button>
            </div>
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
            <div className="mt-3 divide-y divide-border-default border-t border-border-default">
              {groupPlayers.map((player, playerIndex) => (
                <PlayerPauseCard
                  key={player.id}
                  player={player}
                  index={playerIndex}
                  startTime={session.startTime}
                  readOnly={readOnly}
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
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
