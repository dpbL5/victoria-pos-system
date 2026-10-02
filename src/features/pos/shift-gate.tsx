'use client'

import { ShieldCheck, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatClock } from './format'

/**
 * Chế độ A của màn Ca hôm nay — chưa có ca để vận hành.
 *
 * Cố tình KHÔNG phải modal: không scrim, không khoá nền, không nút bị vô hiệu.
 * Cả màn chỉ còn đúng một việc nên không có gì để chặn — bản cũ phủ một overlay
 * `fixed inset-0` lên chính màn hình vốn đã trống, rồi đặt thêm ba nút disabled
 * phía sau lớp phủ đó.
 *
 * `openShiftAt` có giá trị khi đã có ca quầy mở cho người khác: lúc đó việc cần
 * làm là THAM GIA, không phải mở ca mới — nên tiêu đề và nút đổi theo.
 */
export function ShiftGate({
  openShiftAt,
  submitting,
  onOpen,
}: {
  /** Giờ mở của ca quầy đang mở sẵn mà người dùng có thể tham gia */
  openShiftAt?: string | null
  submitting: boolean
  onOpen: () => void
}) {
  const joinClock = openShiftAt ? formatClock(openShiftAt) : null

  return (
    <section
      aria-labelledby="shift-gate-title"
      className="flex min-h-[60vh] flex-col items-center justify-center rounded-xl border border-border-default bg-surface-elevated px-6 py-12 text-center shadow-sm"
    >
      <div className="flex size-14 items-center justify-center rounded-2xl bg-warning-bg">
        {joinClock
          ? <UserPlus size={24} className="text-warning" aria-hidden />
          : <ShieldCheck size={24} className="text-warning" aria-hidden />}
      </div>

      <h2
        id="shift-gate-title"
        className="mt-4 text-lg font-semibold text-text-primary"
      >
        {joinClock ? `Có ca quầy đang mở lúc ${joinClock}` : 'Chưa mở ca'}
      </h2>

      <Button
        variant="contrast"
        size="lg"
        fullWidth
        className="mt-5 max-w-xs"
        loading={submitting}
        onClick={onOpen}
      >
        {joinClock ? 'Tham gia ca' : 'Mở ca'}
      </Button>
    </section>
  )
}
