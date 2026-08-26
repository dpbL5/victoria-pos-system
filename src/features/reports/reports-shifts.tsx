'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Banknote,
  CalendarClock,
  ChevronDown,
  ChevronRight,
  CreditCard,
  Search,
  Users,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Input, Label, Select } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { NoticeCard } from '@/components/ui/notice-card'
import { formatClock, money } from '@/features/pos/format'
import { toInputDate } from '@/lib/shared/utils'
import type { ShiftRevenueSummary } from '@/types'
import type { UserSession } from '@/features/pos/types'
import { ReportsShiftDetail } from './reports-shift-detail'
import { isAdminOnly } from '@/lib/shared/roles'

interface ShiftListResponse {
  success: boolean
  data?: ShiftRevenueSummary[]
  pagination?: { page: number; limit: number; total: number; totalPages: number }
  error?: string
}

interface ReportsShiftsProps {
  user: UserSession | null
}

export function ReportsShifts({ user }: ReportsShiftsProps) {
  const [shifts, setShifts] = useState<ShiftRevenueSummary[]>([])
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 })
  const [statusFilter, setStatusFilter] = useState('')
  const [from, setFrom] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 7)
    return toInputDate(d)
  })
  const [to, setTo] = useState(() => toInputDate(new Date()))
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedShiftId, setSelectedShiftId] = useState<string | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  const loadShifts = useCallback(async (page: number) => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      params.set('from', from)
      params.set('to', to)
      if (statusFilter) params.set('status', statusFilter)
      params.set('page', String(page))
      params.set('limit', '20')

      const res = await fetch(`/api/reports/shifts?${params.toString()}`)
      const data: ShiftListResponse = await res.json()

      if (!data.success) {
        setError(data.error || 'Không tải được danh sách ca')
        return
      }

      setShifts(data.data ?? [])
      if (data.pagination) setPagination(data.pagination)
    } catch {
      setError('Lỗi kết nối máy chủ')
    } finally {
      setLoading(false)
    }
  }, [from, to, statusFilter])

  useEffect(() => {
    void loadShifts(1)
  }, [loadShifts])

  const applyQuickRange = (days: number) => {
    const end = new Date()
    const start = new Date()
    start.setDate(end.getDate() - days + 1)
    setFrom(toInputDate(start))
    setTo(toInputDate(end))
  }

  const openDetail = (shiftId: string) => {
    setSelectedShiftId(shiftId)
    setDetailOpen(true)
  }

  const closeDetail = () => {
    setDetailOpen(false)
    setSelectedShiftId(null)
  }

  const handleDetailRefresh = () => {
    void loadShifts(pagination.page)
  }

  const isAdmin = isAdminOnly(user?.role)

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="shift-from">Từ ngày (mở ca)</Label>
            <Input
              id="shift-from"
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="shift-to">Đến ngày</Label>
            <Input
              id="shift-to"
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </div>
        </div>

        <div className="mt-3 grid grid-cols-4 gap-2">
          <Button variant="secondary" size="xs" onClick={() => applyQuickRange(7)}>7 ngày</Button>
          <Button variant="secondary" size="xs" onClick={() => applyQuickRange(30)}>30 ngày</Button>
          <div className="col-span-1">
            <Select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="">Tất cả</option>
              <option value="OPEN">Đang mở</option>
              <option value="CLOSED">Đã đóng</option>
            </Select>
          </div>
          <Button variant="inverse" size="xs" disabled={loading} onClick={() => loadShifts(1)}>
            {loading ? 'Đang tải' : 'Xem'}
          </Button>
        </div>
      </div>

      {error && (
        <NoticeCard
          tone="danger"
          title="Không tải được danh sách ca"
          description={error}
        />
      )}

      <div className="text-xs text-zinc-500 dark:text-zinc-400">
        {pagination.total} ca · Trang {pagination.page}/{pagination.totalPages || 1}
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : shifts.length === 0 ? (
        <EmptyState
          icon={Search}
          message="Không có ca nào"
          description="Thử đổi khoảng ngày hoặc bộ lọc trạng thái."
        />
      ) : (
        <div className="space-y-3">
          {shifts.map((shift) => (
            <ShiftCard
              key={shift.id}
              shift={shift}
              onClick={() => openDetail(shift.id)}
            />
          ))}
        </div>
      )}

      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button
            variant="secondary"
            size="sm"
            icon={ArrowLeft}
            disabled={pagination.page <= 1 || loading}
            onClick={() => loadShifts(pagination.page - 1)}
          >
            Trang trước
          </Button>
          <span className="text-sm text-zinc-500">
            {pagination.page} / {pagination.totalPages}
          </span>
          <Button
            variant="secondary"
            size="sm"
            icon={ArrowRight}
            disabled={pagination.page >= pagination.totalPages || loading}
            onClick={() => loadShifts(pagination.page + 1)}
          >
            Trang sau
          </Button>
        </div>
      )}

      {detailOpen && selectedShiftId && (
        <ReportsShiftDetail
          shiftId={selectedShiftId}
          isAdmin={isAdmin}
          canExport={isAdmin}
          onClose={closeDetail}
          onUpdated={handleDetailRefresh}
        />
      )}
    </div>
  )
}

function ShiftCard({
  shift,
  onClick,
}: {
  shift: ShiftRevenueSummary
  onClick: () => void
}) {
  const diff = shift.cashDifference
  const diffColor =
    diff != null
      ? diff === 0
        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
        : diff < 0
          ? 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300'
          : 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300'
      : ''

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-xl border border-zinc-200 bg-white p-4 text-left shadow-sm transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800/50"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Badge variant={shift.status === 'OPEN' ? 'success' : 'default'}>
            {shift.status === 'OPEN' ? 'Đang mở' : 'Đã đóng'}
          </Badge>
          <span className="text-sm text-zinc-500 dark:text-zinc-400">
            {formatClock(shift.openedAt)}
            {shift.closedAt ? ` → ${formatClock(shift.closedAt)}` : ''}
          </span>
        </div>
        {diff != null && shift.status === 'CLOSED' && (
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${diffColor}`}>
            {diff > 0 ? `+${money(diff)}` : diff < 0 ? money(diff) : 'Khớp'}
          </span>
        )}
      </div>

      <p className="mt-1 text-xs text-zinc-400">
        {shift.staff.fullName} · {shift.sessionCount} phiên chơi
        · {shift.paymentCount + shift.membershipCount} giao dịch
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-5">
        <MiniMetric icon={Banknote} label="Tổng DT" value={money(shift.totalRevenue)} />
        <MiniMetric icon={Banknote} label="Tiền mặt" value={money(shift.cashRevenue)} />
        <MiniMetric icon={CreditCard} label="Chuyển khoản" value={money(shift.transferRevenue)} />
        <MiniMetric icon={CreditCard} label="Thẻ" value={money(shift.cardRevenue)} />
        <MiniMetric icon={Users} label="Hội viên" value={money(shift.memberRevenue)} />
      </div>

      {shift.status === 'CLOSED' && shift.closingCash != null && (
        <div className="mt-2 grid grid-cols-3 gap-2 rounded-lg bg-zinc-50 p-2 dark:bg-zinc-950">
          <div>
            <span className="text-[10px] text-zinc-400">Đầu ca</span>
            <p className="text-xs font-semibold">{money(shift.openingCash)}</p>
          </div>
          <div>
            <span className="text-[10px] text-zinc-400">Dự kiến</span>
            <p className="text-xs font-semibold">{money(shift.expectedCash ?? 0)}</p>
          </div>
          <div>
            <span className="text-[10px] text-zinc-400">Thực tế</span>
            <p className="text-xs font-semibold">{money(shift.closingCash)}</p>
          </div>
        </div>
      )}

      {shift.toolStats && shift.status === 'CLOSED' && (
        <details className="group mt-2">
          <summary className="cursor-pointer list-none rounded-lg bg-zinc-50 p-2 transition-colors hover:bg-zinc-100 dark:bg-zinc-950 dark:hover:bg-zinc-900">
            <div className="grid grid-cols-3 gap-2">
              <div>
                <span className="text-[10px] text-zinc-400">Dụng cụ</span>
                <p className="flex items-center gap-1 text-xs font-semibold">
                  <ChevronRight size={12} className="group-open:hidden" />
                  <ChevronDown size={12} className="hidden group-open:block" />
                  {shift.toolStats.total} món
                </p>
              </div>
              <div>
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400">Khớp</span>
                <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">{shift.toolStats.matched}</p>
              </div>
              <div>
                <span className="text-[10px] text-amber-600 dark:text-amber-400">Lệch</span>
                <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">{shift.toolStats.mismatched}</p>
              </div>
            </div>
          </summary>
          {shift.toolCounts && shift.toolCounts.length > 0 && (
            <div className="mt-1 space-y-1 rounded-lg bg-white p-2 dark:bg-zinc-900">
              {shift.toolCounts.map((tc) => {
                const diff = tc.closeCount != null ? tc.closeCount - tc.openCount : null
                return (
                  <div key={tc.id} className="flex items-center justify-between gap-2 py-1 text-xs">
                    <span className="text-zinc-700 dark:text-zinc-300">{tc.tool.name}</span>
                    <span className="tabular-nums text-zinc-500">
                      Mở: {tc.openCount}
                      {tc.closeCount != null && <> · Đóng: {tc.closeCount}</>}
                      {diff != null && (
                        <span className={diff === 0 ? 'ml-1 text-emerald-600' : 'ml-1 text-amber-600'}>
                          ({diff > 0 ? `+${diff}` : diff})
                        </span>
                      )}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </details>
      )}
    </button>
  )
}

function MiniMetric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Banknote
  label: string
  value: string
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon size={13} className="text-zinc-400" />
      <div>
        <p className="text-[10px] text-zinc-400">{label}</p>
        <p className="text-xs font-semibold tabular-nums text-zinc-950 dark:text-white">
          {value}
        </p>
      </div>
    </div>
  )
}