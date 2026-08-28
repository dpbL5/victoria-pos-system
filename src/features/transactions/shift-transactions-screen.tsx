'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Banknote,
  CalendarClock,
  CreditCard,
  ReceiptText,
  RefreshCw,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { FilterButton } from '@/components/ui/filter-button'
import { Label, Select } from '@/components/ui/input'
import { NoticeCard } from '@/components/ui/notice-card'
import { Skeleton, SkeletonPage, SkeletonPanel, SkeletonStats } from '@/components/ui/skeleton'
import { apiJson } from '@/lib/api'
import { shortInvoiceNo } from '@/lib/shared/utils'
import { formatClock, formatDay, money, paymentMethodLabel } from '@/features/pos/format'
import type { Shift } from '@/features/pos/types'
import type { TransactionItem } from '@/types'

interface ShiftTransactionsResponse {
  shiftId: string
  shiftStatus: 'OPEN' | 'CLOSED'
  transactions: TransactionItem[]
  summary: {
    totalAmount: number
    totalCount: number
    paymentCount: number
    membershipCount: number
    cashAmount: number
    transferAmount: number
    cardAmount: number
    memberAmount: number
  }
}

type TypeFilter = 'ALL' | 'payment' | 'membership'

interface ShiftTransactionsScreenProps {
  initialShiftId?: string
}

export function ShiftTransactionsScreen({ initialShiftId }: ShiftTransactionsScreenProps) {
  const router = useRouter()
  const [shifts, setShifts] = useState<Shift[]>([])
  const [selectedShiftId, setSelectedShiftId] = useState<string | null>(null)
  const [transactions, setTransactions] = useState<TransactionItem[]>([])
  const [summary, setSummary] = useState<ShiftTransactionsResponse['summary'] | null>(null)
  const [shiftsLoading, setShiftsLoading] = useState(true)
  const [transactionsLoading, setTransactionsLoading] = useState(false)
  const [shiftsError, setShiftsError] = useState('')
  const [transactionsError, setTransactionsError] = useState('')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('ALL')

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
    setSummary(null)
    try {
      const res = await apiJson<ShiftTransactionsResponse>(
        `/api/shifts/${shiftId}/transactions`
      )
      if (!res.success) {
        setTransactionsError(res.error || 'Không tải được giao dịch')
        return
      }
      setTransactions(res.data?.transactions ?? [])
      setSummary(res.data?.summary ?? null)
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

  const filteredTransactions = useMemo(
    () =>
      typeFilter === 'ALL'
        ? transactions
        : transactions.filter((t) => t.type === typeFilter),
    [transactions, typeFilter]
  )

  const selectedShift = shifts.find((s) => s.id === selectedShiftId) ?? null

  // ── Đang tải danh sách ca ──
  if (shiftsLoading) {
    return (
      <SkeletonPage maxWidth="max-w-5xl">
          <Skeleton className="h-9 w-24" />
          <SkeletonPanel><Skeleton className="h-28 w-full" /></SkeletonPanel>
          <SkeletonStats />
          <SkeletonPanel><Skeleton className="h-64 w-full" /></SkeletonPanel>
      </SkeletonPage>
    )
  }

  // ── Lỗi khi tải danh sách ca ──
  if (shiftsError) {
    return (
      <div className="min-h-full bg-zinc-50 px-4 py-4 dark:bg-zinc-950 md:px-6 md:py-6">
        <div className="mx-auto max-w-5xl space-y-4">
          <PageHeader onBack={() => router.back()} title="Giao dịch trong ca" />
          <NoticeCard
            tone="danger"
            title="Không tải được dữ liệu"
            description={shiftsError}
            action={
              <Button variant="secondary" size="sm" onClick={() => void loadShifts()}>
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
        <div className="mx-auto max-w-5xl space-y-4">
          <PageHeader onBack={() => router.back()} title="Giao dịch trong ca" />
          <EmptyState
            icon={CalendarClock}
            message="Chưa có ca làm"
            description="Mở ca hoặc tham gia ca ở màn Ca hôm nay để xem giao dịch."
            action={
              <Button variant="secondary" size="sm" onClick={() => router.push('/sessions')}>
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
      <div className="mx-auto max-w-5xl space-y-4">
        <PageHeader
          onBack={() => router.back()}
          title="Giao dịch trong ca"
          onRefresh={() => {
            void loadShifts()
            if (selectedShiftId) void loadTransactions(selectedShiftId)
          }}
        />

        <div className="grid grid-cols-1 gap-4 md:grid-cols-[18rem_1fr] md:items-start">
          {/* ── Left rail: shift selector ── */}
          <div className="md:sticky md:top-4">
            <ShiftPickerCard
              shifts={shifts}
              selectedShiftId={selectedShiftId}
              onChange={handlePickerChange}
            />
          </div>

          {/* ── Main: summary + ledger ── */}
          <div className="space-y-4">
            {summary && selectedShift && (
              <ShiftSummaryHero summary={summary} shift={selectedShift} />
            )}

            {summary && (
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                <MethodTile
                  icon={Banknote}
                  label="Tiền mặt"
                  value={money(summary.cashAmount)}
                />
                <MethodTile
                  icon={CreditCard}
                  label="Chuyển khoản"
                  value={money(summary.transferAmount)}
                />
                <MethodTile
                  icon={CreditCard}
                  label="Thẻ"
                  value={money(summary.cardAmount)}
                />
                <MethodTile
                  icon={Users}
                  label="Hội viên"
                  value={money(summary.memberAmount)}
                  accent="purple"
                />
              </div>
            )}

            <TransactionLedger
              loading={transactionsLoading}
              error={transactionsError}
              filter={typeFilter}
              onFilterChange={setTypeFilter}
              totalCount={transactions.length}
              filteredCount={filteredTransactions.length}
              transactions={filteredTransactions}
              onRetry={() => {
                if (selectedShiftId) void loadTransactions(selectedShiftId)
              }}
              onOpenInvoice={(invoiceId) => router.push(`/invoices/${invoiceId}`)}
            />
          </div>
        </div>
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
        <h1 className="text-base font-semibold text-zinc-950 dark:text-white md:text-lg">
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

// ─── Shift picker card (left rail) ───────────────────────────────────────────
function ShiftPickerCard({
  shifts,
  selectedShiftId,
  onChange,
}: {
  shifts: Shift[]
  selectedShiftId: string | null
  onChange: (id: string) => void
}) {
  return (
    <Card padding="md">
      <Label htmlFor="shift-picker" className="text-xs uppercase tracking-wide text-zinc-500">
        Ca làm
      </Label>
      <Select
        id="shift-picker"
        value={selectedShiftId ?? ''}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2"
      >
        {shifts.map((s) => (
          <option key={s.id} value={s.id}>
            {s.status === 'OPEN' ? 'Đang mở' : 'Đã đóng'} · {formatDay(s.openedAt)} ·{' '}
            {formatClock(s.openedAt)} · {s.staff?.fullName ?? '—'}
          </option>
        ))}
      </Select>
      <p className="mt-2 text-[11px] text-zinc-400 dark:text-zinc-500">
        {shifts.length} ca gần đây
      </p>
    </Card>
  )
}

// ─── Hero: Tổng thu + trạng thái ─────────────────────────────────────────────
function ShiftSummaryHero({
  summary,
  shift,
}: {
  summary: ShiftTransactionsResponse['summary']
  shift: Shift
}) {
  const isOpen = shift.status === 'OPEN'
  return (
    <Card padding="md" className="bg-gradient-to-br from-emerald-50 via-white to-white dark:from-emerald-500/10 dark:via-zinc-900 dark:to-zinc-900">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Tổng thu trong ca
            </p>
            <Badge variant={isOpen ? 'success' : 'default'} size="sm">
              {isOpen ? 'Đang mở' : 'Đã đóng'}
            </Badge>
          </div>
          <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight text-zinc-900 dark:text-white md:text-4xl">
            {money(summary.totalAmount)}
          </p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            {formatDay(shift.openedAt)} {formatClock(shift.openedAt)}
            {shift.closedAt && ` → ${formatClock(shift.closedAt)}`}
            {' · '}
            {shift.staff?.fullName ?? '—'}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Giao dịch
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-zinc-900 dark:text-white">
            {summary.totalCount}
          </p>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
            {summary.paymentCount} TT · {summary.membershipCount} HV
          </p>
        </div>
      </div>
    </Card>
  )
}

// ─── Method tile (compact band) ──────────────────────────────────────────────
function MethodTile({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: LucideIcon
  label: string
  value: string
  accent?: 'green' | 'purple' | 'blue'
}) {
  const accentClass =
    accent === 'green'
      ? 'text-emerald-600 dark:text-emerald-400'
      : accent === 'purple'
        ? 'text-purple-600 dark:text-purple-400'
        : accent === 'blue'
          ? 'text-blue-600 dark:text-blue-400'
          : 'text-zinc-900 dark:text-white'
  return (
    <div className="rounded-lg border border-zinc-100 bg-white px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center gap-1.5">
        <Icon size={12} className="text-zinc-400 dark:text-zinc-500" aria-hidden />
        <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          {label}
        </p>
      </div>
      <p className={`mt-1 text-base font-semibold tabular-nums ${accentClass}`}>{value}</p>
    </div>
  )
}

// ─── Ledger (filters + transaction list) ─────────────────────────────────────
function TransactionLedger({
  loading,
  error,
  filter,
  onFilterChange,
  totalCount,
  filteredCount,
  transactions,
  onRetry,
  onOpenInvoice,
}: {
  loading: boolean
  error: string
  filter: TypeFilter
  onFilterChange: (f: TypeFilter) => void
  totalCount: number
  filteredCount: number
  transactions: TransactionItem[]
  onRetry: () => void
  onOpenInvoice: (id: string) => void
}) {
  return (
    <Card padding="none">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-950 dark:text-white">
          Giao dịch{' '}
          <span className="text-zinc-400 dark:text-zinc-500">
            ({filter === 'ALL' ? totalCount : `${filteredCount}/${totalCount}`})
          </span>
        </h2>
        <div className="flex items-center gap-1.5">
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
              <Button variant="secondary" size="sm" onClick={onRetry}>
                Thử lại
              </Button>
            }
          />
        </div>
      ) : filteredCount === 0 ? (
        <div className="p-4">
          <EmptyState
            icon={ReceiptText}
            message={filter === 'ALL' ? 'Chưa có giao dịch' : 'Không có giao dịch thuộc loại này'}
            description={
              filter === 'ALL'
                ? 'Giao dịch của ca này sẽ hiện ở đây.'
                : 'Bỏ chọn bộ lọc để xem tất cả giao dịch.'
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
  const isCancelled = tx.invoiceStatus === 'CANCELLED'
  const canOpen = !!tx.invoiceId
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
        className="grid w-full grid-cols-1 gap-2 px-4 py-3 text-left transition-colors hover:bg-zinc-50 disabled:cursor-default disabled:hover:bg-transparent sm:grid-cols-[7rem_1fr_auto] sm:items-center sm:gap-4 dark:hover:bg-zinc-800/50"
      >
        {/* Time + invoice no — primary identifier */}
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 sm:flex-col sm:items-start sm:gap-0">
          <span className="text-sm font-semibold tabular-nums text-zinc-950 dark:text-white">
            {formatClock(tx.paidAt)}
          </span>
          {tx.invoiceNo && (
            <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
              {shortInvoiceNo(tx.invoiceNo)}
            </span>
          )}
        </div>

        {/* Customer + badges */}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="truncate text-sm font-semibold text-zinc-950 dark:text-white">
              {tx.customerName}
            </p>
            {isMembership ? (
              <Badge variant="purple" size="sm">
                Hội viên
              </Badge>
            ) : tx.customerType === 'MEMBER' ? (
              <Badge variant="purple" size="sm">
                HV
              </Badge>
            ) : (
              <Badge variant="default" size="sm">
                VL
              </Badge>
            )}
            {isCancelled && (
              <Badge variant="danger" size="sm">
                Đã hủy
              </Badge>
            )}
          </div>
          <p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
            {methodLabel}
            {tx.planName ? ` · ${tx.planName}` : ''}
          </p>
        </div>

        {/* Amount — anchored right */}
        <p
          className={`self-end text-base font-bold tabular-nums sm:self-center sm:text-lg ${amountClass}`}
        >
          {money(tx.amount)}
        </p>
      </button>
    </li>
  )
}
