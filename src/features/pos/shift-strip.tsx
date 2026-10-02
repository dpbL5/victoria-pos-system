'use client'

import { ClipboardList, Receipt, UserPlus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
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
 * `shift = null` là trường hợp chưa có ca quầy nào đang mở: dải chỉ nói đúng sự
 * thật đó và đưa ra một nút — không chặn.
 *
 * `readOnly` là chế độ giám sát: ADMIN/MANAGER xem ca đang mở mà không tham gia.
 * Đếm dụng cụ / Giao dịch / Đóng ca là thao tác của người trực ca nên không
 * render ở đây — quản lý muốn thao tác thì bấm `Tham gia ca` trước.
 */
export function ShiftStrip({
  shift,
  readOnly = false,
  onOpen,
  onClose,
  onViewTransactions,
  onCountTools,
  hasCounted,
  canJoin,
  onJoin,
  submitting,
  className = '',
}: {
  shift: Shift | null
  readOnly?: boolean
  onOpen: () => void
  onClose: () => void
  onViewTransactions: () => void
  onCountTools: () => void
  hasCounted: boolean
  canJoin: boolean
  onJoin: () => void
  submitting: boolean
  /** Bề rộng/trạng thái co giãn khi nằm chung hàng với hành động chính trên desktop */
  className?: string
}) {
  if (!shift) {
    return (
      <section className={`flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-xl border border-warning-border bg-warning-bg px-4 py-2.5 ${className}`}>
        <p className="flex min-w-0 items-center gap-2 text-sm text-text-primary">
          <span className="size-2 shrink-0 rounded-full bg-warning" aria-hidden />
          <span className="min-w-0">
            {readOnly ? 'Chưa mở ca — chỉ xem, chưa thao tác được' : 'Chưa mở ca — không thu tiền được'}
          </span>
        </p>
        <Button variant="contrast" size="sm" disabled={submitting} onClick={onOpen}>
          Mở ca
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
    <section className={`rounded-xl border border-border-default bg-surface-elevated px-4 py-3 shadow-sm ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <span className="mt-1.5 size-2 shrink-0 rounded-full bg-success" aria-hidden />
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <h2 className="truncate text-sm font-semibold text-text-primary">
                Ca {formatClock(shift.openedAt)} · {formatDay(shift.openedAt)}
              </h2>
              {readOnly && <Badge variant="default" size="sm">Chỉ xem</Badge>}
            </div>
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

      {readOnly ? (
        canJoin && (
          <div className="mt-3 grid grid-cols-1 gap-2 md:flex md:justify-end">
            <Button variant="contrast" size="sm" icon={UserPlus} disabled={submitting} onClick={onJoin}>
              {submitting ? 'Đang tham gia...' : 'Tham gia ca'}
            </Button>
          </div>
        )
      ) : (
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
            hở một ô trống cạnh hành động phá huỷ. 4 nút → lưới 2×2 kín sẵn.
            `min-h-9` = 36px, đúng chiều cao điều khiển chuẩn của hệ — nút đóng ca
            là hành động không thể đảo nên cao hơn `size="sm"` (28px) một bậc. */}
        <Button
          variant="red"
          size="sm"
          className={`min-h-9 ${canJoin ? 'md:col-auto' : 'col-span-2 md:col-auto'}`}
          onClick={onClose}
        >
          Đóng ca
        </Button>
      </div>
      )}
    </section>
  )
}
