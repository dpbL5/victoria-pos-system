import { ClipboardList, Clock, Users } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatClock, formatDay, money } from './format'
import { MiniStat } from './mini-stat'
import type { Shift } from './types'

export function ShiftRail({
  shift,
  activeCount,
  walkInCount,
  memberCount,
  onOpen,
  onClose,
  onViewTransactions,
  onCountTools,
  hasCounted,
  canJoin,
  onJoin,
  submitting,
}: {
  shift: Shift | null
  activeCount: number
  walkInCount: number
  memberCount: number
  onOpen: () => void
  onClose: () => void
  onViewTransactions: () => void
  onCountTools: () => void
  hasCounted: boolean
  canJoin: boolean
  onJoin: () => void
  submitting: boolean
}) {
  const participantNames = shift?.participants?.map((participant) => participant.staff.fullName) ?? []
  const participantLabel = participantNames.length > 0
    ? `${participantNames.length} nhân viên: ${participantNames.join(', ')}`
    : shift?.staff
      ? `Người mở ca: ${shift.staff.fullName}`
      : ''

  return (
    <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="grid grid-cols-[6px_1fr]">
        <div className={shift ? 'bg-emerald-500' : 'bg-amber-500'} />
        <div className="p-4">
          {/* Trạng thái ca */}
          <div className="flex items-center gap-2">
            <Clock size={18} className={shift ? 'shrink-0 text-emerald-500' : 'shrink-0 text-amber-500'} />
            <h2 className="min-w-0 flex-1 text-sm font-semibold text-zinc-950 dark:text-white">
              {shift ? `Ca mở từ ${formatClock(shift.openedAt)}` : 'Chưa mở ca'}
            </h2>
            <Badge variant={shift ? 'success' : 'warning'}>
              {shift ? 'Đang mở' : 'Chưa mở ca'}
            </Badge>
          </div>

          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            {shift
              ? `${formatDay(shift.openedAt)} · Tiền đầu ca ${money(shift.openingCash)}`
              : 'Mở ca mới hoặc tham gia ca quầy đang mở để vận hành POS.'}
          </p>

          {shift && participantLabel && (
            <p className="mt-2 flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
              <Users size={13} className="shrink-0" />
              <span className="min-w-0">{participantLabel}</span>
            </p>
          )}

          {/* Thao tác — mobile xếp lưới 2 cột, desktop hàng ngang */}
          {shift ? (
            <div className="mt-3 grid grid-cols-2 gap-2 md:flex md:flex-wrap md:items-center md:justify-end md:gap-2">
              <Button
                variant={hasCounted ? 'secondary' : 'primary'}
                size="sm"
                icon={ClipboardList}
                disabled={hasCounted}
                onClick={onCountTools}
              >
                {hasCounted ? 'Đã đếm D.cụ' : 'Đếm dụng cụ'}
              </Button>
              {canJoin && (
                <Button
                  variant="primary"
                  size="sm"
                  disabled={submitting}
                  onClick={onJoin}
                >
                  {submitting ? 'Đang tham gia...' : 'Tham gia ca làm'}
                </Button>
              )}
              <Button variant="secondary" size="sm" onClick={onViewTransactions}>
                Xem giao dịch
              </Button>
              <Button variant="secondary" size="sm" onClick={onClose}>
                Đóng ca
              </Button>
            </div>
          ) : (
            <div className="mt-3 flex flex-col gap-2 md:flex-row md:justify-end">
              <Button variant="primary" size="md" fullWidth onClick={onOpen}>
                Mở/Tham gia
              </Button>
            </div>
          )}

          <div className="mt-4 grid grid-cols-3 gap-2">
            <MiniStat label="Đang chơi" value={activeCount} />
            <MiniStat label="Vãng lai" value={walkInCount} />
            <MiniStat label="Hội viên" value={memberCount} />
          </div>
        </div>
      </div>
    </section>
  )
}
