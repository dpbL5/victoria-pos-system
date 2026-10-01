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
import { apiJson } from '@/lib/api'
import { shortInvoiceNo } from '@/lib/shared/utils'
import { formatClock, formatDay, money, paymentMethodLabel } from '@/features/pos/format'
import type { Shift } from '@/features/pos/types'
import type { TransactionItem } from '@/types'

interface ShiftTransactionsResponse {
  transactions: TransactionItem[]
}

type TypeFilter = 'ALL' | 'payment' | 'membership' | 'deposit'

interface ShiftTransactionsScreenProps {
  initialShiftId?: string
}

export function ShiftTransactionsScreen({ initialShiftId }: ShiftTransactionsScreenProps) {
  const router = useRouter()
  const [shifts, setShifts] = useState<Shift[]>([])
  const [selectedShiftId, setSelectedShiftId] = useState<string | null>(null)
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
        apiJson<Shift[]>('/api/shifts?limit=100'),
      ])
      if (!currentRes.success || !listRes.success) {
        setShiftsError(currentRes.error || listRes.error || 'Không tải được ca làm')
        return
      }
      const shiftList = listRes.data ?? []
      setShifts(shiftList)

      const hasInitial = !!initialShiftId && shiftList.some((s) => s.id === initialShiftId)
      const resolved = hasInitial
        ? initialShiftId!
        : currentRes.data?.id ?? shiftList[0]?.id ?? null
      if (initialShiftId && !hasInitial) router.replace('/transactions')
      setSelectedShiftId(resolved)
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

  const handlePickerChange = (id: string) => {
    if (!id) return
    setSelectedShiftId(id)
    router.replace('/transactions?shiftId=' + id, { scroll: false })
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
    <div className="min-h-full bg-zinc-50 px-4 py-4 dark:bg-zinc-950 md:px-6 md:py-6">
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
      <div className="min-h-full bg-zinc-50 px-4 py-4 dark:bg-zinc-950 md:px-6 md:py-6">
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
      <div className="min-h-full bg-zinc-50 px-4 py-4 dark:bg-zinc-950 md:px-6 md:py-6">
        <div className="mx-auto max-w-content space-y-4">
        <PageHeader
          onBack={() => router.back()}
          title="Giao dịch trong ca"
          onRefresh={() => {
            void loadShifts()
            if (selectedShiftId) void loadTransactions(selectedShiftId)
          }}
        />

        {/* ── Shift selector — inline, no left rail ── */}
        <ShiftPickerBar
          shifts={shifts}
          selectedShiftId={selectedShiftId}
          onChange={handlePickerChange}
        />

        <TransactionLedger
          loading={transactionsLoading}
          error={transactionsError}
          filter={typeFilter}
          onFilterChange={setTypeFilter}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          filteredCount={filteredTransactions.length}
          transactions={filteredTransactions}
          onRetry={() => {
            if (selectedShiftId) void loadTransactions(selectedShiftId)
          }}
          onOpenInvoice={(invoiceId) => router.push(`/invoices/${invoiceId}`)}
        />
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
        <h1 className={PAGE_TITLE_CLASS}>
          {title}
        </h1>
      </div>
      {onRefresh && (
        <Button
          variant="ghost"
          size="sm"
          icon={RefreshCw}
          aria-label="Làm mới"
          onClick={onRefresh}
          />
        )}
      </div>
    )
  }

// ─── Shift picker bar (inline toolbar, not a side rail) ─────────────────────
function ShiftPickerBar({
  shifts,
  selectedShiftId,
  onChange,
}: {
  shifts: Shift[]
  selectedShiftId: string | null
  onChange: (id: string) => void
}) {
  return (
    <Card padding="sm">
    <div className="flex items-center gap-3">
        <Label
          htmlFor="shift-picker"
          className="mb-0 shrink-0 text-[11px] font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400"
        >
          Ca làm
        </Label>
        <Select
          id="shift-picker"
            value={selectedShiftId ?? ''}
          onChange={(event) => onChange(event.target.value)}
          className="min-w-0 flex-1 text-sm"
        >
          {shifts.map((s) => (
            <option key={s.id} value={s.id}>
              {s.status === 'OPEN' ? 'Đang mở' : 'Đã đóng'} · {formatDay(s.openedAt)} ·{' '}
              {formatClock(s.openedAt)} · {s.staff?.fullName ?? '—'}
            </option>
          ))}
        </Select>
      </div>
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
      <div className="flex flex-col gap-2 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
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
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500"
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
        <div className="p-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
          Đang tải giao dịch...
        </div>
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
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
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
        <div className="border-t border-zinc-200 px-4 py-2 text-center text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
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
    ? 'text-zinc-400 line-through dark:text-zinc-500'
    : 'text-zinc-950 dark:text-white'

  return (
    <li>
      <button
        type="button"
        disabled={!canOpen}
        onClick={() => {
          if (canOpen) onOpen(tx.invoiceId!)
        }}
        className="grid w-full grid-cols-[3.5rem_minmax(0,1fr)_auto_auto] items-center gap-x-3 px-4 py-3 text-left transition-colors hover:bg-zinc-50 disabled:cursor-default disabled:hover:bg-transparent sm:grid-cols-[5rem_minmax(0,1fr)_9rem_auto] sm:gap-x-4 dark:hover:bg-zinc-800/50"
      >
        {/* Time — fixed, scannable, primary sort key */}
        <span className="text-sm font-semibold tabular-nums text-zinc-950 dark:text-white">
          {formatClock(tx.paidAt)}
        </span>

        {/* Customer + meta */}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="truncate text-sm font-semibold text-zinc-950 dark:text-white">
              {tx.customerName}
            </p>
            {isCancelled && (
              <Badge variant="danger" size="sm">
                Đã hủy
              </Badge>
            )}
          </div>
          <p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
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
