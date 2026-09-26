'use client'

import { useState } from 'react'
import { CalendarClock, Check, Phone, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { formatVND, formatVnDateTime } from '@/lib/shared/utils'

export interface BookingItem {
  id: string
  scheduledAt: string
  playerCount: number
  depositAmount: number | string
  depositAppliedAmount: number | string
  depositRefundedAmount: number | string
  customerName: string | null
  customerPhone: string | null
  status: 'BOOKED' | 'CHECKED_IN' | 'CANCELLED' | 'NO_SHOW'
  customer: { id: string; fullName: string; phone: string | null; type: string } | null
}

export function BookingCards({
  bookings,
  onCheckIn,
  busyId,
  actionDisabled = false,
}: {
  bookings: BookingItem[]
  onCheckIn?: (booking: BookingItem) => void
  busyId?: string | null
  actionDisabled?: boolean
}) {
  const [confirmingBooking, setConfirmingBooking] = useState<BookingItem | null>(null)

  if (!bookings.length) {
    return <p className="px-4 py-4 text-sm text-zinc-500 dark:text-zinc-400">Chưa có lịch đặt trong ngày.</p>
  }

  return (
    <>
    <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
      {bookings.map((booking) => {
        const name = booking.customer?.fullName ?? booking.customerName ?? 'Khách lẻ'
        const phone = booking.customer?.phone ?? booking.customerPhone
        const depositLeft = Number(booking.depositAmount) - Number(booking.depositAppliedAmount) - Number(booking.depositRefundedAmount)
        return (
          <li key={booking.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <p className="truncate text-sm font-semibold text-zinc-950 dark:text-white">{name}</p>
                <span className="inline-flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                  <CalendarClock size={13} />{formatVnDateTime(booking.scheduledAt)}
                </span>
                <span className="inline-flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                  <Users size={13} />{booking.playerCount} người
                </span>
                {phone && <span className="inline-flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400"><Phone size={12} />{phone}</span>}
              </div>
              {depositLeft > 0 && <p className="mt-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">Đã cọc {formatVND(depositLeft)}</p>}
            </div>
            {onCheckIn && booking.status === 'BOOKED' && (
              <Button variant="inverse" size="sm" disabled={actionDisabled || busyId === booking.id} onClick={() => setConfirmingBooking(booking)}>
                <Check size={14} />
                {busyId === booking.id ? 'Đang xử lý...' : 'Xác nhận & Chơi'}
              </Button>
            )}
          </li>
        )
      })}
    </ul>
    <Modal
      open={!!confirmingBooking}
      onClose={() => setConfirmingBooking(null)}
      title="Xác nhận khách đến?"
      footer={(
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" size="lg" fullWidth onClick={() => setConfirmingBooking(null)}>Quay lại</Button>
          <Button
            variant="primary"
            size="lg"
            fullWidth
            disabled={!confirmingBooking || actionDisabled || busyId === confirmingBooking?.id}
            onClick={() => {
              if (!confirmingBooking) return
              onCheckIn?.(confirmingBooking)
              setConfirmingBooking(null)
            }}
          >
            Xác nhận & Chơi
          </Button>
        </div>
      )}
    >
      <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
        Bắt đầu phiên cho {confirmingBooking?.customer?.fullName ?? confirmingBooking?.customerName ?? 'Khách lẻ'} ({confirmingBooking?.playerCount} người). Giờ chơi được tính từ lúc xác nhận.
      </p>
    </Modal>
    </>
  )
}
