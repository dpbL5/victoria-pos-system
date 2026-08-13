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
import { EmptyState } from '@/components/ui/empty-state'
import { FilterButton } from '@/components/ui/filter-button'
import { Label, Select } from '@/components/ui/input'
import { NoticeCard } from '@/components/ui/notice-card'
import { Skeleton } from '@/components/ui/skeleton'
import { apiJson } from '@/lib/api'
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
      <div className="min-h-full bg-zinc-50 px-4 py-4 dark:bg-zinc-950 md:px-6 md:py-6">
        <div className="mx-auto max-w-2xl space-y-4">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-20 w-full" />
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    )
  }

  // ── Lỗi khi tải danh sách ca ──
  if (shiftsError) {
    return (
      <div className="min-h-full bg-zinc-50 px-4 py-4 dark:bg-zinc-950 md:px-6 md:py-6">
        <div className="mx-auto max-w-2xl space-y-4">
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
        <div className="mx-auto max-w-2xl space-y-4">
          <Button variant="ghost" size="sm" icon={ArrowLeft} onClick={() => router.back()}>
            Quay lại
          </Button>
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
      <div className="mx-auto max-w-2xl space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" icon={ArrowLeft} onClick={() => router.back()}>
              Quay lại
            </Button>
            <h1 className="hidden text-lg font-bold text-zinc-950 dark:text-white md:block">
              Giao dịch trong ca
            </h1>
          </div>
          <Button
            variant="ghost"
            size="sm"
            icon={RefreshCw}
            aria-label="Làm mới"
            onClick={() => {
              void loadShifts()
              if (selectedShiftId) void loadTransactions(selectedShiftId)
            }}
          />
        </div>

        {/* Chọn ca */}
        <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <Label htmlFor="shift-picker">Chọn ca</Label>
          <Select
            id="shift-picker"
            value={selectedShiftId ?? ''}
            onChange={(event) => handlePickerChange(event.target.value)}
          >
            <option value="" disabled>
              Chọn ca...
            </option>
            {shifts.map((s) => (
              <option key={s.id} value={s.id}>
                {s.status === 'OPEN' ? 'Đang mở' : 'Đã đóng'} · {formatDay(s.openedAt)}{' '}
                {formatClock(s.openedAt)} · {s.staff?.fullName ?? '—'}
              </option>
            ))}
          </Select>
          {selectedShift && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
              <Badge
                variant={selectedShift.status === 'OPEN' ? 'success' : 'default'}
                size="sm"
              >
                {selectedShift.status === 'OPEN' ? 'Đang mở' : 'Đã đóng'}
              </Badge>
              <span>
                {formatDay(selectedShift.openedAt)} {formatClock(selectedShift.openedAt)}
              </span>
              {selectedShift.closedAt && <span>→ {formatClock(selectedShift.closedAt)}</span>}
              <span>· {selectedShift.staff?.fullName ?? '—'}</span>
            </div>
          )}
        </section>

        {/* Tổng hợp thu chi */}
        {summary && (
          <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-sm font-semibold text-zinc-950 dark:text-white">
              Tổng hợp thu chi
            </h2>
            <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3">
              <SummaryTile
                icon={Banknote}
                label="Tổng thu"
                value={money(summary.totalAmount)}
                highlight
              />
              <SummaryTile
                icon={ReceiptText}
                label="Số giao dịch"
                value={String(summary.totalCount)}
                sub={`${summary.paymentCount} TT · ${summary.membershipCount} HV`}
              />
              <SummaryTile
                icon={Banknote}
                label="Tiền mặt"
                value={money(summary.cashAmount)}
              />
              <SummaryTile
                icon={CreditCard}
                label="Chuyển khoản"
                value={money(summary.transferAmount)}
              />
              <SummaryTile icon={CreditCard} label="Thẻ" value={money(summary.cardAmount)} />
              <SummaryTile icon={Users} label="Hội viên" value={money(summary.memberAmount)} />
            </div>
          </section>
        )}

        {/* Bộ lọc loại giao dịch */}
        <div className="flex items-center gap-2">
          <FilterButton active={typeFilter === 'ALL'} onClick={() => setTypeFilter('ALL')}>
            Tất cả
          </FilterButton>
          <FilterButton
            active={typeFilter === 'payment'}
            onClick={() => setTypeFilter('payment')}
          >
            Thanh toán
          </FilterButton>
          <FilterButton
            active={typeFilter === 'membership'}
            onClick={() => setTypeFilter('membership')}
          >
            Hội viên
          </FilterButton>
        </div>

        {/* Danh sách giao dịch */}
        <section className="rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
            <h2 className="text-sm font-semibold text-zinc-950 dark:text-white">
              Giao dịch ({filteredTransactions.length})
            </h2>
            {transactionsLoading && (
              <span className="text-xs text-zinc-500 dark:text-zinc-400">Đang tải...</span>
            )}
          </div>

          {transactionsLoading && transactions.length === 0 ? (
            <div className="p-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
              Đang tải giao dịch...
            </div>
          ) : transactionsError ? (
            <div className="p-4">
              <NoticeCard
                tone="danger"
                title="Không tải được giao dịch"
                description={transactionsError}
                action={
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => selectedShiftId && void loadTransactions(selectedShiftId)}
                  >
                    Thử lại
                  </Button>
                }
              />
            </div>
          ) : filteredTransactions.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={ReceiptText}
                message="Chưa có giao dịch"
                description="Giao dịch của ca này sẽ hiện ở đây."
              />
            </div>
          ) : (
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {filteredTransactions.map((tx) => (
                <button
                  key={`${tx.type}-${tx.id}`}
                  type="button"
                  disabled={!tx.invoiceId}
                  onClick={() => {
                    if (tx.invoiceId) router.push(`/invoices/${tx.invoiceId}`)
                  }}
                  className="grid w-full grid-cols-[1fr_auto] gap-3 px-4 py-3 text-left transition-colors hover:bg-zinc-50 disabled:cursor-default disabled:hover:bg-transparent dark:hover:bg-zinc-800/50"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold text-zinc-950 dark:text-white">
                        {tx.customerName}
                      </p>
                      {tx.type === 'membership' ? (
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
                      {tx.invoiceStatus === 'CANCELLED' && (
                        <Badge variant="danger" size="sm">
                          Đã hủy
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                      {formatClock(tx.paidAt)}
                      {tx.invoiceNo ? ` · ${tx.invoiceNo}` : ''}
                      {tx.type === 'membership' && tx.planName ? ` · ${tx.planName}` : ''}
                      {' · '}
                      {tx.type === 'membership'
                        ? 'Phí hội viên'
                        : tx.paymentMethod
                          ? paymentMethodLabel(tx.paymentMethod)
                          : ''}
                    </p>
                  </div>
                  <p className="self-center text-sm font-bold tabular-nums text-zinc-950 dark:text-white">
                    {money(tx.amount)}
                  </p>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function SummaryTile({
  icon: Icon,
  label,
  value,
  sub,
  highlight,
}: {
  icon: LucideIcon
  label: string
  value: string
  sub?: string
  highlight?: boolean
}) {
  return (
    <div className="rounded-lg bg-zinc-50 px-3 py-2 dark:bg-zinc-950">
      <div className="flex items-center gap-1.5">
        {Icon && (
          <Icon
            size={12}
            className={highlight ? 'text-emerald-500' : 'text-zinc-400 dark:text-zinc-500'}
          />
        )}
        <p className="text-[11px] text-zinc-500 dark:text-zinc-400">{label}</p>
      </div>
      <p
        className={`mt-0.5 text-lg font-semibold tabular-nums ${
          highlight ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-950 dark:text-white'
        }`}
      >
        {value}
      </p>
      {sub && <p className="mt-0.5 text-[10px] text-zinc-500 dark:text-zinc-400">{sub}</p>}
    </div>
  )
}
