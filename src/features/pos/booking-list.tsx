'use client'

import { useState } from 'react'
import { CalendarClock, Check, Phone, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Input, Label } from '@/components/ui/input'
import { formatVND } from '@/lib/shared/utils'
import { formatClock } from './format'

export interface BookingItem {
  id: string
  scheduledAt: string
  playerCount: number
  depositAmount: number | string
  depositAppliedAmount: number | string
  depositRefundedAmount: number | string
  customerName: string | null
  customerPhone: string | null
  status: 'BOOKED' | 'CHECKED_IN' | 'CANCELLED'
  customer: { id: string; fullName: string; phone: string | null; type: string } | null
}

function toTimeInput(value: Date | string) {
  const date = new Date(value)
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function toCheckInTime(value: string, now: Date) {
  const [hours, minutes] = value.split(':').map(Number)
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null

  const checkInAt = new Date(now)
  checkInAt.setHours(hours, minutes, 0, 0)
  if (checkInAt > now) checkInAt.setDate(checkInAt.getDate() - 1)
  return checkInAt
}

export function BookingCards({
  bookings,
  onCheckIn,
  busyId,
  actionDisabled = false,
  shiftOpenedAt,
}: {
  bookings: BookingItem[]
  onCheckIn?: (booking: BookingItem, startTime: string) => void
  busyId?: string | null
  actionDisabled?: boolean
  shiftOpenedAt?: string | null
}) {
  const [confirmingBooking, setConfirmingBooking] = useState<BookingItem | null>(null)
  const [checkInAt, setCheckInAt] = useState('')
  const [timeError, setTimeError] = useState('')

  const openConfirmation = (booking: BookingItem) => {
    setConfirmingBooking(booking)
    setCheckInAt(toTimeInput(new Date()))
    setTimeError('')
  }

  const closeConfirmation = () => {
    setConfirmingBooking(null)
    setTimeError('')
  }

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
          <li key={booking.id} className="flex items-start justify-between gap-3 px-4 py-3">
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <p className="truncate text-sm font-semibold text-zinc-950 dark:text-white">{name}</p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="inline-flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                  <CalendarClock size={13} />{formatClock(booking.scheduledAt)}
                </span>
                <span className="inline-flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                  <Users size={13} />{booking.playerCount} người
                </span>
                {phone && (
                  <a
                    href={`tel:${phone}`}
                    className="inline-flex items-center gap-1 text-xs text-zinc-500 underline-offset-2 transition-colors hover:text-zinc-900 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-zinc-400 dark:hover:text-zinc-200 dark:focus:ring-blue-400"
                    aria-label={`Gọi ${phone}`}
                  >
                    <Phone size={12} />{phone}
                  </a>
                )}
              </div>
            </div>
            {(depositLeft > 0 || (onCheckIn && booking.status === 'BOOKED')) && (
              <div className="flex shrink-0 flex-col items-end gap-2">
                {depositLeft > 0 && <p className="whitespace-nowrap text-base font-semibold text-emerald-700 dark:text-emerald-400">Đã cọc {formatVND(depositLeft)}</p>}
                {onCheckIn && booking.status === 'BOOKED' && (
                  <Button variant="inverse" size="sm" disabled={actionDisabled || busyId === booking.id} onClick={() => openConfirmation(booking)}>
                    <Check size={14} />
                    {busyId === booking.id ? 'Đang xử lý...' : 'Xác nhận & Chơi'}
                  </Button>
                )}
              </div>
            )}
          </li>
        )
      })}
    </ul>
    <ConfirmDialog
      open={!!confirmingBooking}
      onClose={closeConfirmation}
      title="Xác nhận khách đến?"
      confirmLabel="Xác nhận & Chơi"
      submitting={busyId === confirmingBooking?.id}
      onConfirm={() => {
        if (!confirmingBooking || actionDisabled) return
        const now = new Date()
        const selectedAt = toCheckInTime(checkInAt, now)
        const openedAt = shiftOpenedAt ? new Date(shiftOpenedAt) : null
        if (!selectedAt || selectedAt > now || (openedAt && selectedAt < openedAt)) {
          setTimeError('Thời điểm check-in phải nằm từ lúc mở ca đến hiện tại.')
          return
        }
        onCheckIn?.(confirmingBooking, selectedAt.toISOString())
        closeConfirmation()
      }}
      body={(
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
            Bắt đầu phiên cho {confirmingBooking?.customer?.fullName ?? confirmingBooking?.customerName ?? 'Khách lẻ'} ({confirmingBooking?.playerCount} người).
          </p>
          <div>
            <Label htmlFor="booking-check-in-time">Giờ check-in</Label>
            <Input
              id="booking-check-in-time"
              type="time"
              value={checkInAt}
              onChange={(event) => {
                setCheckInAt(event.target.value)
                setTimeError('')
              }}
            />
            {timeError && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{timeError}</p>}
          </div>
        </div>
      )}
    />
    </>
  )
}
