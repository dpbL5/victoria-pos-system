'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarPlus, Check, CircleX, Pencil, UserRound } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Input, Label, Textarea } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { SortableTable, type Column } from '@/components/ui/sortable-table'
import { useToast } from '@/components/ui/toast'
import { apiJson, jsonRequest } from '@/lib/api'
import { formatVND, formatVnDateTime, today } from '@/lib/shared/utils'
import { CustomerSearch } from '@/features/pos/customer-search'
import type { BookingItem } from '@/features/pos/booking-list'

type BookingRow = BookingItem & {
  notes: string | null
  staff: { id: string; fullName: string }
}
type Customer = { id: string; fullName: string; phone: string | null; type: 'WALK_IN' | 'MEMBER' }

function localDateTime(value: string) {
  return new Date(Date.parse(value) + 7 * 60 * 60_000).toISOString().slice(0, 16)
}

function defaultDateTime() {
  const date = new Date(Date.now() + 60 * 60_000)
  date.setMinutes(Math.ceil(date.getMinutes() / 15) * 15, 0, 0)
  return localDateTime(date.toISOString())
}

export function BookingsScreen() {
  const router = useRouter()
  const { success, error } = useToast()
  const [date, setDate] = useState(today())
  const [bookings, setBookings] = useState<BookingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [editing, setEditing] = useState<BookingRow | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [scheduledAt, setScheduledAt] = useState(defaultDateTime)
  const [playerCount, setPlayerCount] = useState('1')
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [customerSearch, setCustomerSearch] = useState('')
  const [walkInName, setWalkInName] = useState('')
  const [walkInPhone, setWalkInPhone] = useState('')
  const [notes, setNotes] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const response = await apiJson<BookingRow[]>(`/api/bookings?date=${date}`)
      if (!response.success) throw new Error(response.error || 'Không tải được lịch đặt')
      setBookings(response.data ?? [])
    } catch (cause) {
      error((cause as Error).message || 'Lỗi kết nối máy chủ')
    } finally {
      setLoading(false)
    }
  }, [date, error])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load() }, [load])

  const resetForm = () => {
    setEditing(null)
    setScheduledAt(defaultDateTime())
    setPlayerCount('1')
    setCustomer(null)
    setCustomerSearch('')
    setWalkInName('')
    setWalkInPhone('')
    setNotes('')
  }

  const openEdit = (booking: BookingRow) => {
    setEditing(booking)
    setScheduledAt(localDateTime(booking.scheduledAt))
    setPlayerCount(String(booking.playerCount))
    setWalkInName(booking.customer?.fullName ?? booking.customerName ?? '')
    setWalkInPhone(booking.customer?.phone ?? booking.customerPhone ?? '')
    setNotes(booking.notes ?? '')
    setCustomer(booking.customer ? { ...booking.customer, type: booking.customer.type as Customer['type'] } : null)
    setCustomerSearch(booking.customer?.fullName ?? '')
    setFormOpen(true)
  }

  const submit = async () => {
    if (!scheduledAt || (!customer && !walkInName.trim())) {
      error('Nhập tên khách và giờ hẹn')
      return
    }
    setSaving(true)
    try {
      const payload = {
        customerId: customer?.id ?? null,
        customerName: customer ? null : walkInName.trim(),
        customerPhone: customer ? null : walkInPhone.trim() || null,
        scheduledAt: parseVnDateTime(scheduledAt).toISOString(),
        playerCount: Number(playerCount),
        notes: notes.trim() || null,
      }
      const response = editing
        ? await apiJson(`/api/bookings/${editing.id}`, { ...jsonRequest(payload), method: 'PATCH' })
        : await apiJson('/api/bookings', jsonRequest(payload))
      if (!response.success) throw new Error(response.error || 'Không lưu được lịch đặt')
      success(editing ? 'Đã cập nhật lịch đặt' : 'Đã tạo lịch đặt')
      setFormOpen(false)
      resetForm()
      await load()
    } catch (cause) {
      error((cause as Error).message || 'Lỗi kết nối máy chủ')
    } finally {
      setSaving(false)
    }
  }

  const updateStatus = async (booking: BookingRow, status: 'CANCELLED' | 'NO_SHOW') => {
    setBusyId(booking.id)
    try {
      const response = await apiJson(`/api/bookings/${booking.id}`, { ...jsonRequest({ status }), method: 'PATCH' })
      if (!response.success) throw new Error(response.error || 'Không cập nhật được lịch')
      success(status === 'CANCELLED' ? 'Đã hủy lịch' : 'Đã đánh dấu khách không đến')
      await load()
    } catch (cause) {
      error((cause as Error).message || 'Lỗi kết nối máy chủ')
    } finally {
      setBusyId(null)
    }
  }

  const checkIn = async (booking: BookingRow) => {
    setBusyId(booking.id)
    try {
      const response = await apiJson(`/api/bookings/${booking.id}`, { ...jsonRequest({ action: 'check-in' }), method: 'PATCH' })
      if (!response.success) throw new Error(response.error || 'Không check-in được')
      success('Đã xác nhận lịch và bắt đầu phiên chơi')
      router.push('/sessions')
    } catch (cause) {
      error((cause as Error).message || 'Lỗi kết nối máy chủ')
    } finally {
      setBusyId(null)
    }
  }

  const startCreate = () => {
    resetForm()
    setFormOpen(true)
  }

  const columns: Column<BookingRow>[] = [
    {
      label: 'Khách hàng',
      render: (booking) => (
        <div>
          <p className="font-semibold text-zinc-950 dark:text-white">
            {booking.customer?.fullName ?? booking.customerName ?? 'Khách lẻ'}
          </p>
          {(booking.customer?.phone ?? booking.customerPhone) && (
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              {booking.customer?.phone ?? booking.customerPhone}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'scheduledAt',
      label: 'Giờ hẹn',
      render: (booking) => formatVnDateTime(booking.scheduledAt),
    },
    {
      key: 'playerCount',
      label: 'Số người',
      render: (booking) => `${booking.playerCount} người`,
    },
    {
      key: 'status',
      label: 'Trạng thái',
      render: (booking) => {
        const statusText = { BOOKED: 'Đã đặt', CHECKED_IN: 'Đã check-in', CANCELLED: 'Đã hủy', NO_SHOW: 'Không đến' }[booking.status]
        const variant = { BOOKED: 'blue', CHECKED_IN: 'success', CANCELLED: 'default', NO_SHOW: 'warning' }[booking.status] as 'blue' | 'success' | 'default' | 'warning'
        return <Badge variant={variant}>{statusText}</Badge>
      },
    },
    {
      label: 'Tiền cọc',
      render: (booking) => {
        const depositLeft = Number(booking.depositAmount) - Number(booking.depositAppliedAmount) - Number(booking.depositRefundedAmount)
        return depositLeft > 0 ? <span className="font-medium text-emerald-700 dark:text-emerald-400">{formatVND(depositLeft)}</span> : '—'
      },
    },
    {
      label: 'Thao tác',
      headerClassName: 'text-right',
      cellClassName: 'px-3 text-right',
      render: (booking) => booking.status === 'BOOKED' ? (
        <div className="flex justify-end gap-1">
          <Button variant="inverse" size="sm" disabled={busyId === booking.id} onClick={() => void checkIn(booking)}><Check size={14} />Xác nhận & Chơi</Button>
          <Button variant="secondary" size="sm" onClick={() => openEdit(booking)}><Pencil size={14} />Đổi lịch</Button>
          <Button variant="ghost" size="sm" disabled={busyId === booking.id || Number(booking.depositAmount) > Number(booking.depositAppliedAmount) + Number(booking.depositRefundedAmount)} onClick={() => void updateStatus(booking, 'CANCELLED')}><CircleX size={14} />Hủy</Button>
          <Button variant="ghost" size="sm" disabled={busyId === booking.id || Number(booking.depositAmount) > Number(booking.depositAppliedAmount) + Number(booking.depositRefundedAmount)} onClick={() => void updateStatus(booking, 'NO_SHOW')}><UserRound size={14} />Không đến</Button>
        </div>
      ) : '—',
    },
  ]

  return (
    <div className="min-h-full bg-zinc-50 px-4 py-4 dark:bg-zinc-950 md:px-6 md:py-6">
      <div className="mx-auto max-w-content space-y-4">
        <header className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-zinc-950 dark:text-white">Lịch check-in</h1>
          <Button variant="secondary" size="sm" onClick={() => void load()}>Làm mới</Button>
        </header>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <Label htmlFor="booking-date">Ngày</Label>
            <Input id="booking-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </div>
          <Button variant="primary" onClick={startCreate}><CalendarPlus size={16} />Đặt lịch</Button>
        </div>

        {loading ? <Card><p className="text-sm text-zinc-500">Đang tải lịch...</p></Card> : bookings.length === 0 ? (
          <EmptyState icon={CalendarPlus} message="Chưa có lịch đặt" description="Tạo lịch để nhân viên xác nhận nhanh khi khách tới." action={<Button variant="primary" onClick={startCreate}>Đặt lịch</Button>} />
        ) : (
          <SortableTable
            columns={columns}
            data={bookings}
            keyExtractor={(booking) => booking.id}
            sortableKeys={['scheduledAt', 'playerCount', 'status']}
            defaultSortKey="scheduledAt"
            defaultSortDir="asc"
            search={{
              placeholder: 'Tìm tên hoặc số điện thoại khách',
              getText: (booking) => `${booking.customer?.fullName ?? booking.customerName ?? ''} ${booking.customer?.phone ?? booking.customerPhone ?? ''}`,
            }}
            emptyIcon={CalendarPlus}
            emptyMessage="Chưa có lịch đặt"
          />
        )}
      </div>

      <Modal open={formOpen} onClose={() => { setFormOpen(false); resetForm() }} title={editing ? 'Sửa lịch đặt' : 'Đặt lịch check-in'} variant="center" footer={
        <Button variant="primary" size="lg" fullWidth disabled={saving} onClick={() => void submit()}>{saving ? 'Đang lưu...' : editing ? 'Lưu thay đổi' : 'Tạo lịch'}</Button>
      }>
        <div className="space-y-3">
          <div>
            <Label>Hội viên</Label>
            {customer ? (
              <div className="flex items-center justify-between rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700">
                <span>{customer.fullName}{customer.phone ? ` · ${customer.phone}` : ''}</span>
                <Button variant="ghost" size="sm" onClick={() => { setCustomer(null); setCustomerSearch(''); setWalkInName(''); setWalkInPhone('') }}>Đổi</Button>
              </div>
            ) : (
              <CustomerSearch<Customer> value={customerSearch} onValueChange={setCustomerSearch} onSelect={(value) => { setCustomer(value); setWalkInName(value.fullName); setWalkInPhone(value.phone ?? '') }} />
            )}
          </div>
          {!customer && <>
            <div><Label htmlFor="booking-name" required>Tên khách vãng lai</Label><Input id="booking-name" value={walkInName} onChange={(event) => setWalkInName(event.target.value)} maxLength={100} /></div>
            <div><Label htmlFor="booking-phone">Số điện thoại</Label><Input id="booking-phone" inputMode="numeric" value={walkInPhone} onChange={(event) => setWalkInPhone(event.target.value)} /></div>
          </>}
          <div className="grid grid-cols-2 gap-3">
            <div><Label htmlFor="booking-time" required>Ngày và giờ hẹn</Label><Input id="booking-time" type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} /></div>
            <div><Label htmlFor="booking-players">Số người</Label><Input id="booking-players" type="number" min={1} max={50} value={playerCount} onChange={(event) => setPlayerCount(event.target.value)} /></div>
          </div>
          {!editing && <p className="text-sm text-zinc-500">Lịch đặt là bản nháp; mở ca khi khách đến để xác nhận và bắt đầu phiên.</p>}
          <div><Label htmlFor="booking-notes">Ghi chú</Label><Textarea id="booking-notes" rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={500} /></div>
        </div>
      </Modal>
    </div>
  )
}

function parseVnDateTime(value: string) {
  const [datePart, timePart] = value.split('T')
  const [year, month, day] = datePart.split('-').map(Number)
  const [hour, minute] = timePart.split(':').map(Number)
  return new Date(Date.UTC(year, month - 1, day, hour, minute) - 7 * 60 * 60_000)
}
