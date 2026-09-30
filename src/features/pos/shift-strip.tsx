'use client'

import { ClipboardList, Receipt, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatClock, formatDay, money } from './format'
import type { Shift } from './types'

/**
 * Chế độ B — dải ca của màn Ca hôm nay.
 *
 * Không có trạng thái thu gọn. Bản cũ (`shift-rail.tsx`) là một card gập/mở được:
 * muốn Đóng ca hay Xem giao dịch phải bấm mở trước, và trạng thái gập được lưu
 * trong state nên mỗi lần vào màn lại phải nhớ nó đang ở đâu. Bỏ toggle = bỏ một
 * trạng thái ẩn, một cú bấm, và một nhánh render.
 *
 * `shift = null` là trường hợp ADMIN chưa mở ca: vẫn được vận hành (backend cho
 * phép), nên dải chỉ nói đúng sự thật đó và đưa ra một nút — không chặn.
 */
export function ShiftStrip({
  shift,
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
  onOpen: () => void
  onClose: () => void
  onViewTransactions: () => void
  onCountTools: () => void
  hasCounted: boolean
  canJoin: boolean
  onJoin: () => void
  submitting: boolean
}) {
  if (!shift) {
    return (
      <section className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-xl border border-warning-border bg-warning-bg px-4 py-2.5">
        <p className="flex min-w-0 items-center gap-2 text-sm text-text-primary">
          <span className="size-2 shrink-0 rounded-full bg-warning" aria-hidden />
          <span className="min-w-0">Chưa mở ca — thao tác sẽ không gắn ca</span>
        </p>
        <Button variant="contrast" size="sm" disabled={submitting} onClick={onOpen}>
          Mở / Tham gia ca
        </Button>
      </section>
    )
  }

  const participantNames = shift.participants
    ?.filter((participant) => !participant.leftAt)
    .map((participant) => participant.staff.fullName) ?? []
  const participantLabel = participantNames.length > 0
    ? participantNames.join(', ')
    : shift.staff?.fullName ?? ''

  return (
    <section className="rounded-xl border border-border-default bg-surface-elevated px-4 py-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <span className="mt-1.5 size-2 shrink-0 rounded-full bg-success" aria-hidden />
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-text-primary">
              Ca {formatClock(shift.openedAt)} · {formatDay(shift.openedAt)}
            </h2>
            {participantLabel && (
              <p className="mt-0.5 truncate text-xs text-text-tertiary">{participantLabel}</p>
            )}
          </div>
        </div>

        <div className="shrink-0 text-right">
          <p className="text-xs text-text-tertiary">Tiền đầu ca</p>
          <p className="text-sm font-semibold tabular-nums text-text-primary">
            {money(shift.openingCash)}
          </p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 md:flex md:flex-wrap md:justify-end">
        <Button
          variant={hasCounted ? 'white' : 'contrast'}
          size="sm"
          icon={ClipboardList}
          disabled={hasCounted}
          onClick={onCountTools}
        >
          {hasCounted ? 'Đã đếm D.cụ' : 'Đếm dụng cụ'}
        </Button>
        {canJoin && (
          <Button variant="contrast" size="sm" icon={UserPlus} disabled={submitting} onClick={onJoin}>
            {submitting ? 'Đang tham gia...' : 'Tham gia ca'}
          </Button>
        )}
        <Button variant="white" size="sm" icon={Receipt} onClick={onViewTransactions}>
          Giao dịch
        </Button>
        {/* 3 nút (không có Tham gia ca) → Đóng ca chiếm trọn hàng dưới để không
            hở một ô trống cạnh hành động phá huỷ. 4 nút → lưới 2×2 kín sẵn. */}
        <Button
          variant="red"
          size="sm"
          className={canJoin ? 'md:col-auto' : 'col-span-2 md:col-auto'}
          onClick={onClose}
        >
          Đóng ca
        </Button>
      </div>
    </section>
  )
}
