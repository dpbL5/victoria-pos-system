'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  CalendarClock,
  ReceiptText,
  RefreshCw,
  Search,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { FilterButton } from '@/components/ui/filter-button'
import { Input, Label, Select } from '@/components/ui/input'
import { NoticeCard } from '@/components/ui/notice-card'
import { AppSkeleton } from '@/components/ui/skeleton'
import { PAGE_TITLE_CLASS } from '@/components/ui/page-title'
import { usePageRefresh } from '@/components/layout/page-refresh-context'
import { apiJson } from '@/lib/api'
import { shortInvoiceNo, toInputDate, today, formatVnDateTime } from '@/lib/shared/utils'
import { formatClock, money, paymentMethodLabel } from '@/features/pos/format'
import { BALANCE_LABEL_CLASS, BalanceGrid, ToolMark } from '@/features/shifts/balance-grid'
import {
  formatShiftDuration,
  participantNote,
  shiftLedger,
  shiftTimeRange,
  toolVerdict,
} from '@/features/shifts/shift-ledger'
import type { Shift } from '@/features/pos/types'
import type { TransactionItem } from '@/types'

interface ShiftTransactionsResponse {
  transactions: TransactionItem[]
}

type TypeFilter = 'ALL' | 'payment' | 'membership' | 'deposit'

interface ShiftTransactionsScreenProps {
  initialShiftId?: string
}

/** Ca gom theo NGÀY giờ VN để bộ chọn ngày khớp đúng ca của ngày đó. */
export function groupShiftsByDate(shifts: Shift[]): Map<string, Shift[]> {
  const grouped = new Map<string, Shift[]>()
  for (const shift of shifts) {
    const key = toInputDate(new Date(shift.openedAt))
    const list = grouped.get(key)
    if (list) list.push(shift)
    else grouped.set(key, [shift])
  }
  for (const list of grouped.values()) {
    list.sort((a, b) => Date.parse(a.openedAt) - Date.parse(b.openedAt))
  }
  return grouped
}

/** Nhãn ca trong select: giờ mở (giờ VN) · người mở ca. */
export function shiftOptionLabel(shift: Shift): string {
  const clock = formatVnDateTime(shift.openedAt).split(' ')[1]
  return [clock, shift.staff?.fullName].filter(Boolean).join(' · ')
}

export function ShiftTransactionsScreen({ initialShiftId }: ShiftTransactionsScreenProps) {
  const router = useRouter()
  const [shifts, setShifts] = useState<Shift[]>([])
  const [selectedShiftId, setSelectedShiftId] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState(() => today())
  const [transactions, setTransactions] = useState<TransactionItem[]>([])
  const [shiftsLoading, setShiftsLoading] = useState(true)
  const [transactionsLoading, setTransactionsLoading] = useState(false)
  const [shiftsError, setShiftsError] = useState('')
  const [transactionsError, setTransactionsError] = useState('')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('ALL')
  const [searchQuery, setSearchQuery] = useState('')

  // ── Load danh sách ca + resolve ca mặc định (param → ca đang mở → ca gần nhất) ──
  const loadShifts = useCallback(async () => {
    setShiftsLoading(true)
    setShiftsError('')
    try {
      const [currentRes, listRes] = await Promise.all([
        apiJson<Shift | null>('/api/shifts?current=true'),
        // `includeParticipants=all` để khối chi tiết ca thấy cả người đã rời ca;
        // include này cũng mang toolCounts (xem shiftWithAllParticipantsInclude).
        apiJson<Shift[]>('/api/shifts?limit=100&includeParticipants=all'),
      ])
      if (!currentRes.success || !listRes.success) {
        setShiftsError(currentRes.error || listRes.error || 'Không tải được ca làm')
        return
      }
      const shiftList = listRes.data ?? []
      setShifts(shiftList)

      const hasInitial = !!initialShiftId && shiftList.some((s) => s.id === initialShiftId)
      const requested = hasInitial
        ? initialShiftId!
        : currentRes.data?.id ?? shiftList[0]?.id ?? null
      // Ca đang mở có thể nằm ngoài 100 ca gần nhất — rơi về ca gần nhất để
      // select và dữ liệu đang xem luôn khớp nhau.
      const resolved = shiftList.find((s) => s.id === requested) ?? shiftList[0] ?? null
      if (initialShiftId && !hasInitial) router.replace('/transactions')
      if (resolved) setSelectedDate(toInputDate(new Date(resolved.openedAt)))
      setSelectedShiftId(resolved?.id ?? null)
    } catch {
      setShiftsError('Lỗi kết nối máy chủ')
    } finally {
      setShiftsLoading(false)
    }
  }, [initialShiftId, router])

  // ── Load giao dịch của 1 ca ──
  const loadTransactions = useCallback(async (shiftId: string) => {
    setTransactionsLoading(true)
    setTransactionsError('')
    setTransactions([])
    try {
      const res = await apiJson<ShiftTransactionsResponse>(
        `/api/shifts/${shiftId}/transactions`
      )
      if (!res.success) {
        setTransactionsError(res.error || 'Không tải được giao dịch')
        return
      }
      setTransactions(res.data?.transactions ?? [])
    } catch {
      setTransactionsError('Lỗi kết nối máy chủ')
    } finally {
      setTransactionsLoading(false)
    }
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadShifts() }, [loadShifts])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (selectedShiftId) void loadTransactions(selectedShiftId) }, [selectedShiftId, loadTransactions])

  const refresh = useCallback(() => {
    void loadShifts()
    if (selectedShiftId) void loadTransactions(selectedShiftId)
  }, [loadShifts, loadTransactions, selectedShiftId])

  const { registerRefresh } = usePageRefresh()
  useEffect(() => registerRefresh(refresh), [registerRefresh, refresh])

  // Ca gom theo NGÀY giờ VN để bộ chọn ngày khớp đúng ca của ngày đó.
  const shiftsByDate = useMemo(() => groupShiftsByDate(shifts), [shifts])

  const dayShifts = useMemo(() => shiftsByDate.get(selectedDate) ?? [], [shiftsByDate, selectedDate])

  const selectedShift = useMemo(
    () => shifts.find((shift) => shift.id === selectedShiftId) ?? null,
    [shifts, selectedShiftId],
  )

  const selectShift = (id: string) => {
    setSelectedShiftId(id)
    router.replace('/transactions?shiftId=' + id, { scroll: false })
  }

  const handleDateChange = (date: string) => {
    if (!date) return
    setSelectedDate(date)
    const first = shiftsByDate.get(date)?.[0]
    if (first) {
      selectShift(first.id)
      return
    }
    setSelectedShiftId(null)
    router.replace('/transactions', { scroll: false })
  }

  const filteredTransactions = useMemo(() => {
    const byType =
      typeFilter === 'ALL'
        ? transactions
        : transactions.filter((t) => typeFilter === 'payment' ? t.type === 'payment' : t.type === typeFilter)
    const q = searchQuery.trim().toLowerCase()
    if (!q) return byType
    return byType.filter((t) => {
      if (t.customerName.toLowerCase().includes(q)) return true
      if (t.invoiceNo && t.invoiceNo.toLowerCase().includes(q)) return true
      if (t.staffName.toLowerCase().includes(q)) return true
      if (t.planName && t.planName.toLowerCase().includes(q)) return true
      return false
    })
  }, [transactions, typeFilter, searchQuery])

  // ── Đang tải danh sách ca ──
  if (shiftsLoading) {
    return <AppSkeleton />
  }

  // ── Lỗi khi tải danh sách ca ──
  if (shiftsError) {
    return (
      <div className="min-h-full bg-surface-secondary px-4 py-4 md:px-6 md:py-6">
        <div className="mx-auto max-w-content space-y-4">
          <PageHeader onBack={() => router.back()} title="Giao dịch trong ca" />
          <NoticeCard
            tone="danger"
            title="Không tải được dữ liệu"
            description={shiftsError}
            action={
              <Button variant="white" size="sm" onClick={() => void loadShifts()}>
                Thử lại
              </Button>
            }
          />
        </div>
      </div>
    )
  }

  // ── Chưa có ca nào ──
  if (shifts.length === 0) {
    return (
      <div className="min-h-full bg-surface-secondary px-4 py-4 md:px-6 md:py-6">
        <div className="mx-auto max-w-content space-y-4">
          <PageHeader onBack={() => router.back()} title="Giao dịch trong ca" />
          <EmptyState
            icon={CalendarClock}
            message="Chưa có ca làm"
            description="Mở ca hoặc tham gia ca ở màn Ca hôm nay để xem giao dịch."
            action={
              <Button variant="white" size="sm" onClick={() => router.push('/sessions')}>
                Đi tới Ca hôm nay
              </Button>
            }
          />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-full bg-surface-secondary px-4 py-4 md:px-6 md:py-6">
      <div className="mx-auto max-w-content space-y-4">
        <PageHeader
          onBack={() => router.back()}
          title="Giao dịch trong ca"
          onRefresh={refresh}
        />

        <ShiftPicker
          dayShifts={dayShifts}
          selectedDate={selectedDate}
          selectedShiftId={selectedShiftId}
          onDateChange={handleDateChange}
          onShiftChange={selectShift}
        />

        {selectedShift && <ShiftSheet shift={selectedShift} />}

        {selectedShiftId ? (
          <TransactionLedger
            loading={transactionsLoading}
            error={transactionsError}
            filter={typeFilter}
            onFilterChange={setTypeFilter}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            filteredCount={filteredTransactions.length}
            transactions={filteredTransactions}
            onRetry={() => void loadTransactions(selectedShiftId)}
            onOpenInvoice={(invoiceId) => router.push(`/invoices/${invoiceId}`)}
          />
        ) : (
          <EmptyState
            icon={CalendarClock}
            message="Ngày này không có ca"
            description="Chọn ngày khác, hoặc mở ca ở màn Ca hôm nay rồi quay lại."
            action={
              <Button variant="white" size="sm" onClick={() => router.push('/sessions')}>
                Đi tới Ca hôm nay
              </Button>
            }
          />
        )}
      </div>
    </div>
  )
}

// ─── Page header ──────────────────────────────────────────────────────────────
function PageHeader({
  title,
  onBack,
  onRefresh,
}: {
  title: string
  onBack: () => void
  onRefresh?: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" icon={ArrowLeft} onClick={onBack}>
          Quay lại
        </Button>
        {/* Mobile đã có tiêu đề ở header dán trên cùng — h1 chỉ hiện từ md. */}
        <h1 className={`hidden md:block ${PAGE_TITLE_CLASS}`}>
          {title}
        </h1>
      </div>
      {onRefresh && (
        <Button
          variant="ghost"
          size="sm"
          icon={RefreshCw}
          aria-label="Làm mới"
          className="hidden md:inline-flex"
          onClick={onRefresh}
        />
      )}
    </div>
  )
}

// ─── Bộ chọn ngày + ca (nhãn ca theo giờ mở) ────────────────────────────────
function ShiftPicker({
  dayShifts,
  selectedDate,
  selectedShiftId,
  onDateChange,
  onShiftChange,
}: {
  dayShifts: Shift[]
  selectedDate: string
  selectedShiftId: string | null
  onDateChange: (date: string) => void
  onShiftChange: (id: string) => void
}) {
  return (
    <Card padding="sm">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="shift-date">Chọn ngày</Label>
          <Input
            id="shift-date"
            type="date"
            value={selectedDate}
            onChange={(event) => onDateChange(event.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="shift-picker">Ca làm</Label>
          <Select
            id="shift-picker"
            value={selectedShiftId ?? ''}
            disabled={dayShifts.length === 0}
            onChange={(event) => onShiftChange(event.target.value)}
          >
            {dayShifts.length === 0 ? (
              <option value="">Không có ca</option>
            ) : (
              dayShifts.map((shift) => (
                <option key={shift.id} value={shift.id}>
                  {shiftOptionLabel(shift)}
                </option>
              ))
            )}
          </Select>
        </div>
      </div>
    </Card>
  )
}

// ─── Chi tiết ca: hai vế đối soát tiền mặt + dụng cụ + người trực ────────────
// Hai vế DỰ KIẾN / THỰC ĐẾM sống ở đây chứ không nằm ở danh sách ca: danh sách
// chỉ in kết luận, còn chỗ này đọc được vì sao ra kết luận đó.
function ShiftSheet({ shift }: { shift: Shift }) {
  const ledger = shiftLedger(shift)
  const tools = shift.toolCounts ?? []
  const participants = participantNote(shift.participants ?? [], shift.staff?.id)
  const duration = shift.closedAt
    ? formatShiftDuration(shift.openedAt, shift.closedAt)
    : null

  return (
    <Card padding="none">
      <div className="px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Badge variant={shift.status === 'OPEN' ? 'success' : 'default'} size="sm">
            {shift.status === 'OPEN' ? 'Đang mở' : 'Đã đóng'}
          </Badge>
          <span className="text-sm font-semibold tabular-nums text-text-primary">
            {shiftTimeRange(shift.openedAt, shift.closedAt)}
          </span>
          {duration && <span className="text-xs text-text-tertiary">· {duration}</span>}
        </div>
        <p className="mt-1 text-xs text-text-tertiary">
          Mở bởi{' '}
          <span className="font-medium text-text-secondary">
            {shift.staff?.fullName ?? 'Không rõ'}
          </span>
        </p>
        {participants && (
          <p className="mt-0.5 truncate text-xs text-text-tertiary">{participants}</p>
        )}

        <div className="mt-3 lg:max-w-sm">
          <BalanceGrid
            expected={ledger.expected}
            counted={ledger.counted}
            difference={ledger.difference}
            verdict={ledger.verdict}
          />
        </div>
        <p className="mt-2 text-xs tabular-nums text-text-tertiary">
          Tiền đầu ca {money(shift.openingCash)}
          {shift.status === 'OPEN' && ' · ca đang mở, chưa đối soát'}
        </p>
      </div>

      {tools.length > 0 && (
        <div className="border-t border-border-default px-4 py-3">
          <p className={BALANCE_LABEL_CLASS}>Đối soát dụng cụ</p>
          <ul className="mt-1.5 space-y-1.5">
            {tools.map((tc) => (
              <li key={tc.id} className="flex items-center justify-between gap-3 text-xs">
                <span className="min-w-0 truncate text-text-secondary">{tc.tool.name}</span>
                <span className="flex shrink-0 items-center gap-3">
                  <span className="tabular-nums text-text-tertiary">
                    đầu ca {tc.openCount} · cuối ca {tc.closeCount ?? '—'}
                  </span>
                  <ToolMark verdict={toolVerdict(tc.openCount, tc.closeCount)} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  )
}

// ─── Ledger (search + filters + transaction list) ────────────────────────────
function TransactionLedger({
  loading,
  error,
  filter,
  onFilterChange,
  searchQuery,
  onSearchChange,
  filteredCount,
  transactions,
  onRetry,
  onOpenInvoice,
}: {
  loading: boolean
  error: string
  filter: TypeFilter
  onFilterChange: (f: TypeFilter) => void
  searchQuery: string
  onSearchChange: (q: string) => void
  filteredCount: number
  transactions: TransactionItem[]
  onRetry: () => void
  onOpenInvoice: (id: string) => void
}) {
  const hasFilter = filter !== 'ALL' || searchQuery.trim() !== ''
  return (
    <Card padding="none">
      <div className="flex flex-col gap-2 border-b border-border-default px-4 py-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <FilterButton active={filter === 'ALL'} onClick={() => onFilterChange('ALL')}>
            Tất cả
          </FilterButton>
          <FilterButton
            active={filter === 'payment'}
            onClick={() => onFilterChange('payment')}
          >
            Thanh toán
          </FilterButton>
          <FilterButton
            active={filter === 'membership'}
            onClick={() => onFilterChange('membership')}
          >
            Hội viên
          </FilterButton>
          <FilterButton active={filter === 'deposit'} onClick={() => onFilterChange('deposit')}>
            Tiền cọc
          </FilterButton>
        </div>
        <div className="relative">
          <Search
            size={14}
            aria-hidden
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary"
          />
          <Input
            type="search"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Tìm theo tên khách, mã hóa đơn, nhân viên, gói hội viên…"
            aria-label="Tìm giao dịch"
            className="pl-8 text-sm"
          />
        </div>
      </div>

      {loading && transactions.length === 0 ? (
        <AppSkeleton />
      ) : error ? (
        <div className="p-4">
          <NoticeCard
            tone="danger"
            title="Không tải được giao dịch"
            description={error}
            action={
              <Button variant="white" size="sm" onClick={onRetry}>
                Thử lại
              </Button>
            }
          />
        </div>
      ) : filteredCount === 0 ? (
        <div className="p-4">
          <EmptyState
            icon={ReceiptText}
            message={
              hasFilter
                ? 'Không tìm thấy giao dịch phù hợp'
                : 'Chưa có giao dịch'
            }
            description={
              hasFilter
                ? 'Thử đổi bộ lọc hoặc xoá nội dung tìm kiếm.'
                : 'Giao dịch của ca này sẽ hiện ở đây.'
            }
            action={
              hasFilter ? (
                <Button
                  variant="white"
                  size="sm"
                  onClick={() => {
                    onFilterChange('ALL')
                    onSearchChange('')
                  }}
                >
                  Xoá bộ lọc
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <ul className="divide-y divide-border-default">
          {transactions.map((tx) => (
            <TransactionRow
              key={`${tx.type}-${tx.id}`}
              tx={tx}
              onOpen={onOpenInvoice}
            />
          ))}
        </ul>
      )}

      {loading && transactions.length > 0 && (
        <div className="border-t border-border-default px-4 py-2 text-center text-xs text-text-tertiary">
          Đang cập nhật...
        </div>
      )}
    </Card>
  )
}

// ─── Transaction row ──────────────────────────────────────────────────────────
function TransactionRow({
  tx,
  onOpen,
}: {
  tx: TransactionItem
  onOpen: (invoiceId: string) => void
}) {
  const isMembership = tx.type === 'membership'
  const isDeposit = tx.type === 'deposit'
  const isCancelled = tx.invoiceStatus === 'CANCELLED'
  const canOpen = !!tx.invoiceId
  const invoiceType = isDeposit || tx.invoiceNo?.startsWith('DEP-')
    ? { label: 'Tiền cọc', variant: 'warning' as const }
    : isMembership || tx.invoiceNo?.startsWith('MEM-')
    ? { label: 'Đăng ký hội viên', variant: 'yellow' as const }
    : tx.invoiceNo?.startsWith('SEL-')
      ? { label: 'Bán lẻ', variant: 'warning' as const }
      : { label: 'Thường', variant: 'default' as const }
  const methodLabel = isMembership
    ? 'Phí hội viên'
    : tx.paymentMethod
      ? paymentMethodLabel(tx.paymentMethod)
      : ''

  const amountClass = isCancelled
    ? 'text-text-tertiary line-through'
    : 'text-text-primary'

  return (
    <li>
      <button
        type="button"
        disabled={!canOpen}
        onClick={() => {
          if (canOpen) onOpen(tx.invoiceId!)
        }}
        className="grid w-full grid-cols-[3.5rem_minmax(0,1fr)_auto_auto] items-center gap-x-3 px-4 py-3 text-left transition-colors hover:bg-surface-tertiary disabled:cursor-default disabled:hover:bg-transparent sm:grid-cols-[5rem_minmax(0,1fr)_9rem_auto] sm:gap-x-4"
      >
        {/* Time — fixed, scannable, primary sort key */}
        <span className="text-sm font-semibold tabular-nums text-text-primary">
          {formatClock(tx.paidAt)}
        </span>

        {/* Customer + meta */}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="truncate text-sm font-semibold text-text-primary">
              {tx.customerName}
            </p>
            {isCancelled && (
              <Badge variant="danger" size="sm">
                Đã hủy
              </Badge>
            )}
          </div>
          <p className="mt-0.5 truncate text-xs text-text-tertiary">
            {tx.invoiceNo && (
              <span className="font-mono">{shortInvoiceNo(tx.invoiceNo)}</span>
            )}
            {tx.invoiceNo && ' · '}
            {methodLabel}
            {tx.planName ? ` · ${tx.planName}` : ''}
          </p>
        </div>

        {/* Invoice type */}
        <div className="text-right">
          <Badge variant={invoiceType.variant} size="sm">
            {invoiceType.label}
          </Badge>
        </div>

        {/* Amount — anchored right */}
        <p
          className={`self-center text-right text-sm font-bold tabular-nums sm:text-base ${amountClass}`}
        >
          {money(tx.amount)}
        </p>
      </button>
    </li>
  )
}
