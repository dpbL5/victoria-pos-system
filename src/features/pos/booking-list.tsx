'use client'

import { useEffect, useState } from 'react'
import { CalendarClock, Check, CircleX, Phone, Users } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
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

export function isBookingOverdue(booking: BookingItem, now = Date.now()) {
  const scheduledAt = Date.parse(booking.scheduledAt)
  return booking.status === 'BOOKED' && Number.isFinite(scheduledAt) && scheduledAt < now
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
  onCancel,
  busyId,
  actionDisabled = false,
  shiftOpenedAt,
}: {
  bookings: BookingItem[]
  onCheckIn?: (booking: BookingItem, startTime: string) => void
  onCancel?: (booking: BookingItem) => void
  busyId?: string | null
  actionDisabled?: boolean
  shiftOpenedAt?: string | null
}) {
  const [confirmingBooking, setConfirmingBooking] = useState<BookingItem | null>(null)
  const [cancellingBooking, setCancellingBooking] = useState<BookingItem | null>(null)
  const [checkInAt, setCheckInAt] = useState('')
  const [timeError, setTimeError] = useState('')
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  const openConfirmation = (booking: BookingItem) => {
    setConfirmingBooking(booking)
    setCheckInAt(toTimeInput(new Date()))
    setTimeError('')
  }

  const closeConfirmation = () => {
    setConfirmingBooking(null)
    setTimeError('')
  }

  // Danh sách rỗng: màn Ca tự render dòng "Không có lịch đặt hôm nay" kèm lối vào
  // /bookings. Trả null ở đây để không lặp lại thông báo rỗng đó hai lần.
  if (!bookings.length) return null

  return (
    <>
    <ul className="divide-y divide-border-default">
      {bookings.map((booking) => {
        const name = booking.customer?.fullName ?? booking.customerName ?? 'Khách lẻ'
        const phone = booking.customer?.phone ?? booking.customerPhone
        const depositLeft = Number(booking.depositAmount) - Number(booking.depositAppliedAmount) - Number(booking.depositRefundedAmount)
        const overdue = isBookingOverdue(booking, now)
        const canCancel = overdue && depositLeft <= 0 && onCancel
        return (
          <li key={booking.id} className="flex items-start justify-between gap-3 px-4 py-3">
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <p className="truncate text-sm font-semibold text-text-primary">{name}</p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="inline-flex items-center gap-1 text-xs text-text-tertiary">
                  <CalendarClock size={13} />{formatClock(booking.scheduledAt)}
                </span>
                <span className="inline-flex items-center gap-1 text-xs text-text-tertiary">
                  <Users size={13} />{booking.playerCount} người
                </span>
                  {overdue && <Badge variant="warning" size="sm">Quá giờ hẹn</Badge>}
                {phone && (
                  <a
                    href={`tel:${phone}`}
                    className="inline-flex items-center gap-1 text-xs text-text-tertiary underline-offset-2 transition-colors hover:text-text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-focus-ring"
                    aria-label={`Gọi ${phone}`}
                  >
                    <Phone size={12} />{phone}
                  </a>
                )}
              </div>
            </div>
              {(depositLeft > 0 || (onCheckIn && booking.status === 'BOOKED') || canCancel) && (
              <div className="flex shrink-0 flex-col items-end gap-2">
                {depositLeft > 0 && <p className="whitespace-nowrap text-base font-semibold text-success">Đã cọc {formatVND(depositLeft)}</p>}
                {overdue && depositLeft > 0 && <p role="status" className="max-w-32 text-right text-xs text-warning">Xử lý cọc trước khi hủy</p>}
                {onCheckIn && booking.status === 'BOOKED' && (
                <Button variant="contrast" size="sm" disabled={actionDisabled || busyId === booking.id} onClick={() => openConfirmation(booking)}>
                    <Check size={14} />
                    {busyId === booking.id ? 'Đang xử lý...' : 'Xác nhận & Chơi'}
                  </Button>
                )}
                {canCancel && (
                <Button variant="red" size="sm" disabled={busyId === booking.id} onClick={() => setCancellingBooking(booking)}>
              <CircleX size={14} />Hủy lịch
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
          <p className="text-sm leading-relaxed text-text-secondary">
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
              {timeError && <p className="mt-1 text-xs text-danger">{timeError}</p>}
        </div>
              </div>
      )}
    />
    <ConfirmDialog
      open={!!cancellingBooking}
      onClose={() => setCancellingBooking(null)}
      title="Hủy lịch quá giờ hẹn?"
        description={`Lịch của ${cancellingBooking?.customer?.fullName ?? cancellingBooking?.customerName ?? 'khách'} sẽ được đánh dấu đã hủy.`}
      confirmLabel="Hủy lịch"
        submitting={busyId === cancellingBooking?.id}
      onConfirm={() => {
        if (!cancellingBooking || !onCancel) return
        onCancel(cancellingBooking)
        setCancellingBooking(null)
              }}
    />
    </>
  )
        }
