import { useState } from 'react'
import { ChevronDown, ClipboardList, Clock, Users } from 'lucide-react'
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
  const [collapsed, setCollapsed] = useState(false);

  const participantNames = shift?.participants?.map((participant) => participant.staff.fullName) ?? [];
  const participantLabel = participantNames.length > 0
    ? `${participantNames.length} nhân viên: ${participantNames.join(', ')}`
    : shift?.staff
      ? `Người mở ca: ${shift.staff.fullName}`
      : ''

  return (
    <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="grid grid-cols-[8px_1fr]">
        <div className={shift ? 'bg-emerald-500' : 'bg-amber-500'} aria-hidden />
        <div className="p-4">
          {/* Trạng thái ca — luôn hiển thị, bấm để thu gọn/mở rộng.
              Header gọn: icon + title + chevron. Bỏ badge trùng với thanh màu trái. */}
          <button
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            className="flex w-full items-center gap-2 text-left"
            title={collapsed ? 'Mở rộng thông tin ca' : 'Thu gọn thông tin ca'}
            aria-expanded={!collapsed}
          >
            <Clock size={18} className={shift ? 'shrink-0 text-emerald-500' : 'shrink-0 text-amber-500'} />
            <h2 className="min-w-0 flex-1 text-lg font-semibold text-zinc-950 dark:text-white">
              {shift ? `Ca ${formatClock(shift.openedAt)}, Ngày ${formatDay(shift.openedAt)}` : 'Chưa mở ca'}
            </h2>
            <ChevronDown
              size={16}
              aria-hidden
              className={`shrink-0 text-zinc-400 transition-transform duration-200 ${collapsed ? '' : 'rotate-180'}`}
            />
          </button>

          {/* Nội dung chi tiết — collapse mượt bằng grid-template-rows 0fr→1fr */}
          <div
            className="grid transition-[grid-template-rows,opacity] duration-200 ease-out"
            style={{
              gridTemplateRows: collapsed ? '0fr' : '1fr',
              opacity: collapsed ? 0 : 1,
            }}
            aria-hidden={collapsed}
          >
            <div className="overflow-hidden">
              {shift ? (
                <>
                  {/* Meta: ngày (dòng 1) + tiền đầu ca (dòng 2) — tách để không bị cắt mobile */}
                  <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                    Tiền đầu ca{' '}
                    <span className="font-semibold tabular-nums text-zinc-950 dark:text-white">
                      {money(shift.openingCash)}
                    </span>
                  </p>

                  {participantLabel && (
                    <p className="mt-2 flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                      <Users size={13} className="shrink-0" />
                      <span className="min-w-0">{participantLabel}</span>
                    </p>
                  )}

                  {/* Số liệu live — đặt TRƯỚC thao tác để staff glance nhanh.
                      "Đang chơi" là stat dominant (focal point) — staff mở ca cần biết
                      ngay có bao nhiêu phiên đang chạy để quyết định tiếp khách. */}
                  <div className="mt-4 grid grid-cols-3 gap-2">
                    <MiniStat label="Đang chơi" value={activeCount} variant="accent" />
                    <MiniStat label="Vãng lai" value={walkInCount} />
                    <MiniStat label="Hội viên" value={memberCount} />
                  </div>

                  {/* Thao tác — mobile 2 cột, desktop hàng ngang.
                      "Đếm dụng cụ" primary khi chưa đếm (hành động đầu ca quan trọng nhất);
                      secondary khi đã đếm. "Đóng ca" luôn cuối — hành động phá hủy xa tay nhất. */}
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
                </>
              ) : (
                <>
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                    Mở ca mới hoặc tham gia ca quầy đang mở để vận hành POS.
                  </p>
                  <div className="mt-3 flex flex-col gap-2 md:flex-row md:justify-end">
                    <Button variant="primary" size="md" fullWidth onClick={onOpen}>
                      Mở/Tham gia
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
