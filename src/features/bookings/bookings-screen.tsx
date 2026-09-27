/*!
 * DIRECTION CONTRACT — /bookings (mobile), mode Operate
 * THESIS: Ngày là một lưới giờ chia độ, không phải danh sách card. Khoảng trống giữa các lịch đặt
 *   là thông tin — nó trả lời "15h còn chỗ không" mà không cần mở gì.
 * OWN-WORLD: Token hiện có — brand #2563eb (charcoal ở dark), gold #d4b572, zinc; Card/Badge/
 *   Button/Input/Modal bottom-sheet; lucide. Không thêm màu, font hay primitive mới.
 * STORY: Nhân viên quầy thấy ngày nào dồn qua dải 7 ngày, chạm một ngày để đọc lưới giờ của ngày
 *   đó, chạm vào khe trống để mở form đã điền sẵn ngày + giờ.
 * FIRST VIEWPORT: ô tìm kiếm toàn tuần → dải 7 ngày ghim → lưới giờ của ngày đang chọn; mỗi
 *   khe một giờ, khe có lịch cao gấp đôi khe trống. Một cấu trúc duy nhất cho mọi bề rộng —
 *   desktop giãn khối lịch đặt thành một hàng ngang (giờ · tên · SĐT · số người · cọc), không
 *   còn bảng riêng.
 * FORM: lưới giờ trong ngày — cấu trúc #2 trong danh sách grounded; seed surface 15661a67.
 * FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md
 */
'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarPlus, ChevronLeft, ChevronRight, CircleX, Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Input, Label, Select, Textarea } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { AppSkeleton } from '@/components/ui/skeleton'
import { useToast } from '@/components/ui/toast'
import { usePageRefresh } from '@/components/layout/page-refresh-context'
import { apiJson, jsonRequest } from '@/lib/api'
import { formatVND, formatVnDate, formatVnDateTime, getVnHour, getVnWeekRange, toInputDate, today } from '@/lib/shared/utils'
import { CustomerSearch } from '@/features/pos/customer-search'
import type { BookingItem } from '@/features/pos/booking-list'

type BookingRow = BookingItem & {
  notes: string | null
  staff: { id: string; fullName: string }
}
type Customer = { id: string; fullName: string; phone: string | null; type: 'WALK_IN' | 'MEMBER' }

const STATUS: Record<BookingRow['status'], { label: string; text: string }> = {
  BOOKED: { label: 'Đã đặt', text: 'text-blue-700 dark:text-blue-300' },
  CHECKED_IN: { label: 'Đã check-in', text: 'text-emerald-700 dark:text-emerald-300' },
  CANCELLED: { label: 'Đã hủy', text: 'text-zinc-500 dark:text-zinc-400' },
}

const STATUS_SURFACE: Record<BookingRow['status'], string> = {
  BOOKED: 'border-blue-200 bg-blue-50 hover:border-blue-300 dark:border-blue-500/25 dark:bg-blue-500/10 dark:hover:border-blue-500/40',
  CHECKED_IN: 'border-emerald-200 bg-emerald-50 hover:border-emerald-300 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:hover:border-emerald-500/40',
  CANCELLED: 'border-dashed border-zinc-300 bg-zinc-50 hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900/60 dark:hover:border-zinc-600',
}

const WEEKDAY_SHORT = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']
const WEEKDAY_FULL = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy']

/** YYYY-MM-DD theo giờ Việt Nam của một mốc ISO. */
function dayKeyOf(value: string) {
  return toInputDate(new Date(value))
}

/** HH:mm theo giờ Việt Nam. */
function clockOf(value: string) {
  return formatVnDateTime(value).split(' ')[1]
}

function addDays(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
}

function dayNumber(dateKey: string) {
  return Number(dateKey.slice(8, 10))
}

function weekdayIndexOf(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay()
}

function clamp(value: number, lower: number, upper: number) {
  return Math.min(Math.max(value, lower), upper)
}

function depositLeftOf(booking: BookingRow) {
  return Number(booking.depositAmount) - Number(booking.depositAppliedAmount) - Number(booking.depositRefundedAmount)
}

function bookingName(booking: BookingRow) {
  return booking.customer?.fullName ?? booking.customerName ?? 'Khách lẻ'
}

function bookingPhone(booking: BookingRow) {
  return booking.customer?.phone ?? booking.customerPhone ?? ''
}

function localDateTime(value: string) {
  return new Date(Date.parse(value) + 7 * 60 * 60_000).toISOString().slice(0, 16)
}

function defaultDateTime() {
  const date = new Date(Date.now() + 60 * 60_000)
  date.setMinutes(Math.ceil(date.getMinutes() / 15) * 15, 0, 0)
  return localDateTime(date.toISOString())
}

export function BookingsScreen() {
  const { success, error } = useToast()
  const [weekStart, setWeekStart] = useState(() => getVnWeekRange(today()).from)
  const [selectedDate, setSelectedDate] = useState(() => today())
  const [query, setQuery] = useState('')
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
  const [depositAmount, setDepositAmount] = useState('0')
  const [depositPaymentMethod, setDepositPaymentMethod] = useState<'CASH' | 'TRANSFER' | 'CARD'>('CASH')
  const [notes, setNotes] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const response = await apiJson<BookingRow[]>(`/api/bookings?weekStart=${weekStart}`)
      if (!response.success) throw new Error(response.error || 'Không tải được lịch đặt')
      setBookings(response.data ?? [])
    } catch (cause) {
      error((cause as Error).message || 'Lỗi kết nối máy chủ')
    } finally {
      setLoading(false)
    }
  }, [weekStart, error])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load() }, [load])

  const { registerRefresh } = usePageRefresh()

  useEffect(() => registerRefresh(() => void load()), [registerRefresh, load])

  const weekDates = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)),
    [weekStart],
  )

  const weekBookings = useMemo(
    () => [...bookings].sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt)),
    [bookings],
  )

  const bookingsByDay = useMemo(() => {
    const grouped = new Map<string, BookingRow[]>()
    for (const booking of weekBookings) {
      const key = dayKeyOf(booking.scheduledAt)
      const list = grouped.get(key)
      if (list) list.push(booking)
      else grouped.set(key, [booking])
    }
    return grouped
  }, [weekBookings])

  const normalizedQuery = query.trim().toLocaleLowerCase('vi')
  const matches = useMemo(
    () => normalizedQuery
      ? weekBookings.filter((booking) => `${bookingName(booking)} ${bookingPhone(booking)}`.toLocaleLowerCase('vi').includes(normalizedQuery))
      : [],
    [weekBookings, normalizedQuery],
  )
  const matchIds = useMemo(() => new Set(matches.map((booking) => booking.id)), [matches])
  const matchDays = useMemo(() => new Set(matches.map((booking) => dayKeyOf(booking.scheduledAt))), [matches])

  const dayBookings = useMemo(() => bookingsByDay.get(selectedDate) ?? [], [bookingsByDay, selectedDate])

  const bookingsByHour = useMemo(() => {
    const grouped = new Map<number, BookingRow[]>()
    for (const booking of dayBookings) {
      const hour = getVnHour(new Date(booking.scheduledAt))
      const list = grouped.get(hour)
      if (list) list.push(booking)
      else grouped.set(hour, [booking])
    }
    return grouped
  }, [dayBookings])

  // Lưới co lại quanh lịch của ngày, nhưng không bao giờ giấu mất một lịch nào.
  const gridHours = useMemo(() => {
    if (dayBookings.length === 0) return []
    const hours = dayBookings.map((booking) => getVnHour(new Date(booking.scheduledAt)))
    const first = Math.min(...hours)
    const last = Math.max(...hours)
    const from = clamp(first - 1, Math.min(8, first), first)
    const to = clamp(last + 1, last, Math.max(22, last))
    return Array.from({ length: to - from + 1 }, (_, index) => from + index)
  }, [dayBookings])

  const resetForm = () => {
    setEditing(null)
    setScheduledAt(defaultDateTime())
    setPlayerCount('1')
    setCustomer(null)
    setCustomerSearch('')
    setWalkInName('')
    setWalkInPhone('')
    setDepositAmount('0')
    setDepositPaymentMethod('CASH')
    setNotes('')
  }

  const openEdit = (booking: BookingRow) => {
    setEditing(booking)
    setScheduledAt(localDateTime(booking.scheduledAt))
    setPlayerCount(String(booking.playerCount))
    setWalkInName(bookingName(booking))
    setWalkInPhone(bookingPhone(booking))
    setDepositAmount(String(booking.depositAmount))
    setNotes(booking.notes ?? '')
    setCustomer(booking.customer ? { ...booking.customer, type: booking.customer.type as Customer['type'] } : null)
    setCustomerSearch(bookingName(booking))
    setFormOpen(true)
  }

  const submit = async () => {
    if (!scheduledAt || (!customer && !walkInName.trim())) {
      error('Nhập tên khách và giờ hẹn')
      return
    }
    const deposit = Number(depositAmount || 0)
    if (!Number.isInteger(deposit) || deposit < 0) {
      error('Tiền cọc phải là số nguyên không âm')
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
        ...(!editing ? {
          depositAmount: deposit,
          ...(deposit > 0 ? { depositPaymentMethod } : {}),
        } : {}),
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

  const cancelBooking = async (booking: BookingRow) => {
    setBusyId(booking.id)
    try {
      const response = await apiJson(`/api/bookings/${booking.id}`, { ...jsonRequest({ status: 'CANCELLED' }), method: 'PATCH' })
      if (!response.success) throw new Error(response.error || 'Không cập nhật được lịch')
      success('Đã hủy lịch')
      await load()
      return true
    } catch (cause) {
      error((cause as Error).message || 'Lỗi kết nối máy chủ')
      return false
    } finally {
      setBusyId(null)
    }
  }

  const cancelEditing = async () => {
    if (!editing) return
    if (await cancelBooking(editing)) {
      setFormOpen(false)
      resetForm()
    }
  }

  const startCreate = () => {
    resetForm()
    setFormOpen(true)
  }

  const startCreateAt = (dateKey: string, hour: number) => {
    resetForm()
    setScheduledAt(`${dateKey}T${String(hour).padStart(2, '0')}:00`)
    setFormOpen(true)
  }

  const goToday = () => {
    setWeekStart(getVnWeekRange(today()).from)
    setSelectedDate(today())
  }

  const goWeek = (delta: number) => {
    setWeekStart(addDays(weekStart, delta * 7))
    setSelectedDate(addDays(selectedDate, delta * 7))
  }

  const onQueryChange = (value: string) => {
    setQuery(value)
    const needle = value.trim().toLocaleLowerCase('vi')
    if (!needle) return
    const first = weekBookings.find((booking) => `${bookingName(booking)} ${bookingPhone(booking)}`.toLocaleLowerCase('vi').includes(needle))
    if (first) setSelectedDate(dayKeyOf(first.scheduledAt))
  }

  const navButton = 'motion-press inline-flex h-8 shrink-0 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-200/70 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-zinc-500'
  const isCurrentWeek = weekStart === getVnWeekRange(today()).from
  const todayKey = today()
  const suggestedHour = clamp(getVnHour(new Date()), 8, 21)
  const dayLabel = `${WEEKDAY_FULL[weekdayIndexOf(selectedDate)]} ${formatVnDate(selectedDate)}`

  return (
    <div className="min-h-full bg-zinc-50 px-4 py-4 dark:bg-zinc-950 md:px-6 md:py-6">
      <div className="mx-auto max-w-content space-y-4">
        <header className="hidden items-center justify-between gap-3 md:flex">
          <h1 className="text-2xl font-bold text-zinc-950 dark:text-white">Lịch check-in tuần</h1>
          <Button variant="primary" size="sm" icon={CalendarPlus} onClick={startCreate}>Thêm lịch</Button>
        </header>

        <div className="md:hidden">
          <Button variant="primary" size="md" icon={CalendarPlus} fullWidth onClick={startCreate}>Thêm lịch</Button>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1 space-y-1 md:max-w-sm">
            <div className="relative">
              <Search size={14} aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500 dark:text-zinc-400" />
              <Input
                type="search"
                value={query}
                onChange={(event) => onQueryChange(event.target.value)}
                placeholder="Tìm tên hoặc số điện thoại khách"
                aria-label="Tìm khách trong tuần"
                className="pl-8 text-sm"
              />
            </div>
            {normalizedQuery && (
              <p role="status" className="px-1 text-xs text-zinc-500 dark:text-zinc-400">
                {matches.length > 0
                  ? `${matches.length} kết quả trong tuần — ngày có kết quả được đánh dấu trên dải`
                  : 'Không có lịch nào khớp trong tuần này'}
              </p>
            )}
          </div>
          <div className="hidden shrink-0 md:block">
            <Label htmlFor="booking-week">Tuần bắt đầu từ thứ Hai</Label>
            <Input id="booking-week" type="date" value={weekStart} onChange={(event) => {
              if (event.target.value) {
                setWeekStart(getVnWeekRange(event.target.value).from)
                setSelectedDate(event.target.value)
              }
            }} />
          </div>
        </div>

        <div>
          <div className="sticky top-14 z-20 -mx-4 -mb-1 mt-3 bg-zinc-50 px-4 pb-2 pt-1 dark:-mx-6 dark:bg-zinc-950 dark:px-6 md:top-0">
            <div className="flex items-center gap-1 md:justify-center">
              <button type="button" onClick={() => goWeek(-1)} className={`${navButton} w-8`} aria-label="Tuần trước"><ChevronLeft size={18} /></button>
              <p className="min-w-0 flex-1 truncate text-center text-sm font-semibold tabular-nums text-zinc-900 dark:text-white md:max-w-[15rem] md:flex-none">
                {formatVnDate(weekStart).slice(0, 5)} – {formatVnDate(weekDates[6])}
              </p>
              <button type="button" onClick={() => goWeek(1)} className={`${navButton} w-8`} aria-label="Tuần sau"><ChevronRight size={18} /></button>
              <button
                type="button"
                onClick={goToday}
                disabled={isCurrentWeek && selectedDate === todayKey}
                className={`${navButton} px-2 text-xs font-medium text-blue-700 enabled:hover:bg-blue-50 dark:text-blue-400 dark:enabled:hover:bg-blue-500/10`}
              >
                Hôm nay
              </button>
            </div>

            <div role="group" aria-label="Chọn ngày trong tuần" className="mt-2 grid grid-cols-7 gap-1 md:gap-2">
              {weekDates.map((date) => {
                const count = bookingsByDay.get(date)?.length ?? 0
                const isSelected = date === selectedDate
                const isToday = date === todayKey
                const hasMatch = matchDays.has(date)
                return (
                  <button
                    key={date}
                    type="button"
                    aria-pressed={isSelected}
                    aria-current={isToday ? 'date' : undefined}
                    aria-label={`${WEEKDAY_FULL[weekdayIndexOf(date)]} ${formatVnDate(date)}, ${count > 0 ? `${count} lịch` : 'trống'}`}
                    onClick={() => setSelectedDate(date)}
                    className={`motion-press relative flex flex-col items-center gap-0.5 rounded-xl border px-0.5 pb-1.5 pt-1 md:flex-row md:justify-center md:gap-2 md:px-2 md:py-2.5 ${
                      isSelected
                        ? 'border-brand bg-brand text-white shadow-sm dark:border-blue-600 dark:bg-blue-600'
                        : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800'
                    }`}
                  >
                    <span className={`text-[10px] font-medium leading-none md:text-xs ${isSelected ? 'text-white/85' : 'text-zinc-500 dark:text-zinc-400'}`}>
                      {WEEKDAY_SHORT[weekdayIndexOf(date)]}
                    </span>
                    <span className="text-base font-semibold leading-none tabular-nums">{dayNumber(date)}</span>
                    <span className={`text-[10px] leading-none tabular-nums md:text-xs ${isSelected ? 'text-white/85' : 'text-zinc-500 dark:text-zinc-400'}`}>
                      {count > 0 ? `${count} lịch` : '—'}
                    </span>
                    {hasMatch && (
                      <span aria-hidden className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-amber-500 md:right-1.5 md:top-1.5" />
                    )}
                    {isToday && (
                      <span aria-hidden className={`absolute inset-x-2 bottom-0.5 h-0.5 rounded-full ${isSelected ? 'bg-gold' : 'bg-gold-dark dark:bg-gold'}`} />
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="mt-2" aria-label={`Lịch ngày ${dayLabel}`}>
            {loading ? (
              <AppSkeleton />
            ) : dayBookings.length === 0 ? (
              <EmptyState
                icon={CalendarPlus}
                message={weekBookings.length === 0 ? 'Chưa có lịch đặt' : `Chưa có lịch cho ${dayLabel.toLowerCase()}`}
                description={weekBookings.length === 0
                  ? 'Tạo lịch để nhân viên xác nhận nhanh khi khách tới.'
                  : 'Chọn ngày khác trên dải, hoặc tạo lịch cho ngày này.'}
                action={<Button variant="primary" onClick={() => startCreateAt(selectedDate, suggestedHour)}><CalendarPlus size={16} />Thêm lịch ngày này</Button>}
              />
            ) : (
              <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                {gridHours.map((hour) => {
                  const items = bookingsByHour.get(hour) ?? []
                  const label = `${String(hour).padStart(2, '0')}:00`
                  return (
                    <div key={hour} className={`flex border-t border-zinc-100 first:border-t-0 dark:border-zinc-800/60 ${items.length === 0 ? 'h-9' : 'h-16'}`}>
                      <div aria-hidden className="flex w-11 shrink-0 items-start justify-end pr-2 pt-2 text-[11px] font-medium tabular-nums text-zinc-500 dark:text-zinc-400 md:w-16 md:pr-3 md:text-xs">
                        {label}
                      </div>
                      {items.length === 0 ? (
                        <button
                          type="button"
                          onClick={() => startCreateAt(selectedDate, hour)}
                          aria-label={`Thêm lịch lúc ${label} ngày ${formatVnDate(selectedDate)}`}
                          className="group flex h-full min-w-0 flex-1 items-center gap-1.5 px-2 text-left hover:bg-zinc-50 focus-visible:bg-zinc-50 dark:hover:bg-zinc-800/40 dark:focus-visible:bg-zinc-800/40"
                        >
                          <span aria-hidden className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-dashed border-zinc-300 text-zinc-500 dark:border-zinc-600 dark:text-zinc-400">
                            <Plus size={12} />
                          </span>
                          <span className="truncate text-xs text-zinc-500 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 dark:text-zinc-400 md:opacity-100">
                            Thêm lịch
                          </span>
                        </button>
                      ) : (
                        <div
                          className="grid min-w-0 flex-1 gap-1.5 p-1.5"
                          style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
                        >
                          {items.map((booking, index) => {
                            const depositLeft = depositLeftOf(booking)
                            const matched = matchIds.has(booking.id)
                            const phone = bookingPhone(booking)
                            return (
                              <button
                                key={booking.id}
                                type="button"
                                onClick={() => openEdit(booking)}
                                aria-label={`${formatVnDateTime(booking.scheduledAt)} ${bookingName(booking)}, ${booking.playerCount} người, ${STATUS[booking.status].label}`}
                                style={{ animationDelay: `${index * 35}ms` }}
                                className={`animate-card-enter flex min-w-0 flex-col justify-center gap-0.5 rounded-lg border px-2 py-1.5 text-left transition-colors md:px-3 ${STATUS_SURFACE[booking.status]} ${matched ? 'ring-2 ring-amber-400 dark:ring-amber-500' : ''}`}
                              >
                                <span className="flex min-w-0 flex-col justify-center gap-0.5 md:flex-row md:items-center md:gap-4">
                                  <span className="flex min-w-0 items-baseline gap-1.5 md:shrink-0">
                                    <span className="shrink-0 text-xs font-semibold tabular-nums text-zinc-900 dark:text-white md:text-sm">{clockOf(booking.scheduledAt)}</span>
                                    <span className={`shrink-0 text-[11px] font-medium md:text-xs ${STATUS[booking.status].text}`}>{STATUS[booking.status].label}</span>
                                    {items.length === 1 && depositLeft > 0 && (
                                      <span className="ml-auto shrink-0 text-[11px] font-semibold tabular-nums text-emerald-700 dark:text-emerald-400 md:hidden">{formatVND(depositLeft)}</span>
                                    )}
                                  </span>
                                  <span className="flex min-w-0 items-baseline gap-1.5 md:flex-1">
                                    <span className="truncate text-sm font-medium text-zinc-900 dark:text-white">{bookingName(booking)}</span>
                                    {items.length === 1 && (
                                      <span className="ml-auto shrink-0 text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400 md:hidden">{booking.playerCount} người</span>
                                    )}
                                  </span>
                                  <span className="hidden shrink-0 items-center gap-4 text-xs tabular-nums text-zinc-500 dark:text-zinc-400 md:flex">
                                    {items.length === 1 && phone && <span>{phone}</span>}
                                    <span>{booking.playerCount} người</span>
                                  </span>
                                  {depositLeft > 0 && (
                                    <span className="hidden shrink-0 text-xs font-semibold tabular-nums text-emerald-700 dark:text-emerald-400 md:inline">{formatVND(depositLeft)}</span>
                                  )}
                                </span>
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <Modal
        open={formOpen}
        onClose={() => { setFormOpen(false); resetForm() }}
        title={editing ? 'Sửa lịch đặt' : 'Đặt lịch check-in'}
        variant="center"
        footer={
          <div className="flex items-stretch gap-2">
            {editing?.status === 'BOOKED' && (
              <Button
                variant="outline-danger"
                size="lg"
                disabled={saving || busyId === editing.id || depositLeftOf(editing) > 0}
                onClick={() => void cancelEditing()}
              >
                <CircleX size={14} />Hủy lịch
              </Button>
            )}
            <Button className="flex-1" variant="primary" size="lg" disabled={saving} onClick={() => void submit()}>
              {saving ? 'Đang lưu...' : editing ? 'Lưu thay đổi' : 'Tạo lịch'}
            </Button>
          </div>
        }
      >
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
          {!editing && <div className="grid grid-cols-2 gap-3">
            <div><Label htmlFor="booking-deposit">Tiền đặt cọc</Label><Input id="booking-deposit" type="number" min={0} step={1000} inputMode="numeric" value={depositAmount} onChange={(event) => setDepositAmount(event.target.value)} /></div>
            <div><Label htmlFor="booking-deposit-method">Phương thức nhận cọc</Label><Select id="booking-deposit-method" value={depositPaymentMethod} onChange={(event) => setDepositPaymentMethod(event.target.value as typeof depositPaymentMethod)}><option value="CASH">Tiền mặt</option><option value="TRANSFER">Chuyển khoản</option><option value="CARD">Thẻ</option></Select></div>
          </div>}
          <div><Label htmlFor="booking-notes">Ghi chú (không bắt buộc)</Label><Textarea id="booking-notes" rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={500} /></div>
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
