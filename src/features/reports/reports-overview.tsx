'use client'

import { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  BarChart3,
  Clock,
  Download,
  ReceiptText,
  Target,
  Timer,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Input, Label, Select } from '@/components/ui/input'
import { NoticeCard } from '@/components/ui/notice-card'
import { Skeleton } from '@/components/ui/skeleton'
import { StatCard } from '@/components/ui/stat-card'
import { apiJson } from '@/lib/api'
import { formatClock, money, paymentMethodLabel } from '@/features/pos/format'
import type { PaymentMethod, UserSession } from '@/features/pos/types'
import { toInputDate } from '@/lib/shared/utils'
import { AreaChart, DonutChart, HourlyBarChart, DailyVolumeChart } from './reports-charts'

type ItemType = 'PLAY_TIME' | 'MEMBERSHIP_FEE' | 'PRODUCT' | 'SERVICE' | 'DISCOUNT' | 'SURCHARGE'
type Scope = 'STAFF' | 'ALL'
type Range = 'today' | '7d' | '30d'

interface PaymentBreakdown {
  CASH: { total: number; count: number }
  TRANSFER: { total: number; count: number }
  CARD: { total: number; count: number }
  MEMBER: { total: number; count: number }
}

type ItemBreakdown = Record<ItemType, number>

interface ReportDashboard {
  todayRevenue: number
  todaySessions: number
  activeSessions: number
  totalCustomersToday: number
  scope: Scope
  today: {
    revenue: number
    paymentCount: number
    invoiceCount: number
    sessionsCreated: number
    completedSessions: number
    activeSessions: number
    newCustomers: number
    averagePayment: number
    byPaymentMethod: PaymentBreakdown
    byItemType: ItemBreakdown
  }
  currentShift: null | {
    id: string
    openedAt: string
    openingCash: number
    revenue: number
    cashRevenue: number
    expectedCash: number
    paymentCount: number
    activeSessions: number
    completedSessions: number
    byPaymentMethod: PaymentBreakdown
    byItemType: ItemBreakdown
  }
}

interface RevenueData {
  period: string
  revenue: number
  sessionCount: number
  avgRevenuePerSession: number
}

interface RevenueSummary {
  from: string
  to: string
  totalRevenue: number
  totalSessions: number
  averagePayment: number
}

interface RevenuePayment {
  id: string
  paidAt: string
  customerName: string
  invoiceId: string | null
  invoiceNo: string | null
  paymentMethod: PaymentMethod
  grandTotal: number
  staffName: string
}

interface RevenueResponse {
  success: boolean
  data?: RevenueData[]
  summary?: RevenueSummary
  payments?: RevenuePayment[]
  error?: string
}

interface TrendData {
  byItemType: ItemBreakdown
  byPaymentMethod: Array<{ paymentMethod: string | null; _sum: { grandTotal: number | null } | null; _count: { _all: number } | null }>
  byHour: Array<{ hour: number; revenue: number; count: number }>
  byDay: Array<{ date: string; sessions: number; players: number; revenue: number }>
  comparison: {
    previousRevenue: number
    currentRevenue: number
    previousSessions: number
    currentSessions: number
  }
  totals: {
    revenue: number
    sessions: number
    players: number
    avgHours: number
    revenuePerSession: number
  }
}

interface TrendResponse {
  success: boolean
  data?: TrendData
  error?: string
}

interface ReportsOverviewProps {
  user: UserSession | null
}

export interface ReportsOverviewHandle {
  refresh: () => void
}

const RANGES: Array<{ key: Range; label: string; days: number }> = [
  { key: 'today', label: 'Hôm nay', days: 1 },
  { key: '7d', label: '7 ngày', days: 7 },
  { key: '30d', label: '30 ngày', days: 30 },
]

export const ReportsOverview = forwardRef<ReportsOverviewHandle, ReportsOverviewProps>(
  function ReportsOverview({ user }, ref) {
  const [dashboard, setDashboard] = useState<ReportDashboard | null>(null)
  const [range, setRange] = useState<Range>('today')
  const [revenue, setRevenue] = useState<RevenueData[]>([])
  const [revenueSummary, setRevenueSummary] = useState<RevenueSummary | null>(null)
  const [recentPayments, setRecentPayments] = useState<RevenuePayment[]>([])
  const [trends, setTrends] = useState<TrendData | null>(null)
  const [from, setFrom] = useState(() => toInputDate(new Date()))
  const [to, setTo] = useState(() => toInputDate(new Date()))
  const [exportType, setExportType] = useState('revenue')
  const [loading, setLoading] = useState(true)
  const [revenueLoading, setRevenueLoading] = useState(false)
  const [error, setError] = useState('')

  const loadDashboard = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const dashboardData = await apiJson<ReportDashboard>('/api/reports/dashboard')

      if (!dashboardData.success) throw new Error(dashboardData.error || 'Không tải được báo cáo')

      setDashboard(dashboardData.data ?? null)
    } catch (err) {
      setError((err as Error).message || 'Lỗi kết nối máy chủ')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadRevenue = useCallback(async (nextFrom: string, nextTo: string) => {
    setRevenueLoading(true)
    try {
      const response = await fetch(`/api/reports/revenue?from=${nextFrom}&to=${nextTo}`)
      const data = await response.json() as RevenueResponse

      if (!data.success) {
        setError(data.error || 'Không tải được doanh thu')
        return
      }

      setRevenue(data.data ?? [])
      setRevenueSummary(data.summary ?? null)
      setRecentPayments(data.payments ?? [])
    } catch {
      setError('Lỗi kết nối máy chủ')
    } finally {
      setRevenueLoading(false)
    }
  }, [])

  const loadTrends = useCallback(async (nextFrom: string, nextTo: string) => {
    try {
      const response = await fetch(`/api/reports/trends?from=${nextFrom}&to=${nextTo}`)
      const data = await response.json() as TrendResponse

      if (!data.success) return
      setTrends(data.data ?? null)
    } catch {
      // Trends là bổ trợ — không chặn toàn màn nếu lỗi
    }
  }, [])

  useImperativeHandle(ref, () => ({
    refresh: () => {
      void loadDashboard()
      void loadRevenue(from, to)
      void loadTrends(from, to)
    },
  }), [loadDashboard, loadRevenue, loadTrends, from, to])

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    void loadDashboard()
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [loadDashboard])

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    void loadRevenue(from, to)
    void loadTrends(from, to)
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [from, to, loadRevenue, loadTrends])

  const canExport = user?.role === 'ADMIN'
  const isAdmin = user?.role === 'ADMIN'
  const currentShift = dashboard?.currentShift ?? null
  const today = dashboard?.today

  const applyRange = (nextRange: Range) => {
    setRange(nextRange)
    const active = RANGES.find((r) => r.key === nextRange)!
    const end = new Date()
    const start = new Date()
    start.setDate(end.getDate() - active.days + 1)
    setFrom(toInputDate(start))
    setTo(toInputDate(end))
  }

  const applyQuickRange = (days: number) => {
    const end = new Date()
    const start = new Date()
    start.setDate(end.getDate() - days + 1)
    setFrom(toInputDate(start))
    setTo(toInputDate(end))
  }

  if (loading) {
    return <ReportsOverviewSkeleton />
  }

  return (
    <div className="space-y-4">
      {error && (
        <NoticeCard
          tone="danger"
          title="Không tải được dữ liệu"
          description={error}
        />
      )}

      <NoticeCard
        tone={currentShift ? 'success' : 'warning'}
        title={currentShift ? `Ca đang mở từ ${formatClock(currentShift.openedAt)}` : 'Chưa có ca đang mở'}
        description={
          currentShift
            ? `Doanh thu ca ${money(currentShift.revenue)}, tiền mặt dự kiến ${money(currentShift.expectedCash)}`
            : 'Màn này vẫn xem được doanh thu ngày, nhưng đối soát ca cần nhân viên mở ca trước.'
        }
      />

      <RangeTabs range={range} onChange={applyRange} />

      {today && <Scoreboard today={today} trends={trends} />}

      {currentShift && (
        <ShiftReportPanel shift={currentShift} />
      )}

      <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-950 dark:text-white">
              <TrendingUp size={17} className="text-emerald-500" />
              Doanh thu theo ngày
            </h2>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              {dashboard?.scope === 'STAFF' ? 'Số liệu của ca và tài khoản của bạn' : 'Số liệu toàn bộ hệ thống'}
            </p>
          </div>
          <Badge variant="outline">
            {revenueSummary ? money(revenueSummary.totalRevenue) : money(0)}
          </Badge>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="report-from">Từ ngày</Label>
            <Input
              id="report-from"
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="report-to">Đến ngày</Label>
            <Input
              id="report-to"
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </div>
        </div>

        <div className="mt-3 grid grid-cols-4 gap-2">
          <Button variant="secondary" size="xs" onClick={() => applyQuickRange(1)}>Hôm nay</Button>
          <Button variant="secondary" size="xs" onClick={() => applyQuickRange(7)}>7 ngày</Button>
          <Button variant="secondary" size="xs" onClick={() => applyQuickRange(30)}>30 ngày</Button>
          <Button variant="inverse" size="xs" disabled={revenueLoading} onClick={() => void loadRevenue(from, to)}>
            {revenueLoading ? 'Đang tải' : 'Xem'}
          </Button>
        </div>

        <div className="mt-4">
          {revenueLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : revenue.length === 0 ? (
            <EmptyState
              icon={BarChart3}
              message="Chưa có doanh thu"
              description="Thử đổi khoảng ngày hoặc kiểm tra các giao dịch đã thu."
            />
          ) : (
            <div className="rounded-xl border border-zinc-100 bg-zinc-50/50 p-3 dark:border-zinc-800 dark:bg-zinc-950/40">
              <AreaChart
                data={revenue.map((item) => ({ label: item.period, value: item.revenue }))}
                axisLabels={[formatReportDate(revenue[0].period), formatReportDate(revenue[revenue.length - 1].period)]}
              />
            </div>
          )}
        </div>

        {recentPayments.length > 0 && (
          <div className="mt-6 border-t border-zinc-200 pt-4 dark:border-zinc-800">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Giao dịch gần đây
            </h3>
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {recentPayments.map((payment) => (
                <RecentPaymentRow key={payment.id} payment={payment} />
              ))}
            </div>
          </div>
        )}
      </section>

      {trends && (
        <div className="space-y-4">
          <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <h2 className="text-sm font-semibold text-zinc-950 dark:text-white">Phương thức thanh toán</h2>
              <div className="mt-4">
                <DonutChart
                  data={buildPaymentSlices(trends.byPaymentMethod)}
                  centerValue={money(trends.totals.revenue, false)}
                />
              </div>
            </section>

            <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <h2 className="text-sm font-semibold text-zinc-950 dark:text-white">Nguồn doanh thu</h2>
              <div className="mt-4">
                <DonutChart
                  data={buildItemSlices(trends.byItemType)}
                  centerValue={money(trends.totals.revenue, false)}
                />
              </div>
            </section>
          </section>

          {isAdmin && trends.byHour.length > 0 && (
            <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex items-center gap-2">
                <Clock size={17} className="text-blue-500" />
                <h2 className="text-sm font-semibold text-zinc-950 dark:text-white">Doanh thu theo khung giờ</h2>
              </div>
              <div className="mt-4">
                <HourlyBarChart data={trends.byHour} />
              </div>
            </section>
          )}

          <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-sm font-semibold text-zinc-950 dark:text-white">Lưu lượng khách theo ngày</h2>
            <div className="mt-4">
              <DailyVolumeChart
                data={trends.byDay.map((d) => ({
                  label: formatReportDate(d.date),
                  sessions: d.sessions,
                  players: d.players,
                  revenue: d.revenue,
                }))}
              />
            </div>
          </section>
        </div>
      )}

      <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-950 dark:text-white">
              <Download size={17} className="text-blue-500" />
              Xuất báo cáo
            </h2>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              {canExport ? 'Tải CSV cho khoảng ngày đã chọn' : 'Chỉ quản trị viên được tải file báo cáo'}
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
          <Select
            value={exportType}
            onChange={(event) => setExportType(event.target.value)}
            disabled={!canExport}
          >
            <option value="revenue">Doanh thu</option>
            <option value="sessions">Phiên chơi</option>
          </Select>
          {canExport ? (
            <a
              href={`/api/reports/export?type=${exportType}&from=${from}&to=${to}`}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white"
            >
              <Download size={16} />
              CSV
            </a>
          ) : (
            <button
              type="button"
              disabled
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-zinc-200 px-4 text-sm font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500"
            >
              <Download size={16} />
              CSV
            </button>
          )}
        </div>
      </section>

      {recentPayments.length === 0 && !revenueLoading && revenue.length === 0 && (
        <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <EmptyState
            icon={ReceiptText}
            message="Chưa có giao dịch"
            description="Các khoản thu trong khoảng ngày đã chọn sẽ hiện ở đây."
          />
        </section>
      )}
    </div>
  )
  }
)

function ReportsOverviewSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-16 w-full" />
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
      <Skeleton className="h-72 w-full" />
    </div>
  )
}

// ── Tabs chọn khoảng thời gian ──
function RangeTabs({ range, onChange }: { range: Range; onChange: (range: Range) => void }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {RANGES.map((r) => (
        <button
          key={r.key}
          type="button"
          onClick={() => onChange(r.key)}
          className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
            range === r.key
              ? 'bg-blue-600 text-white'
              : 'bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50 dark:bg-zinc-900 dark:text-zinc-300 dark:ring-zinc-800 dark:hover:bg-zinc-800'
          }`}
        >
          {r.label}
        </button>
      ))}
    </div>
  )
}

// ── Scorecard 4 ô — thay thế DailyScoreboard tự vẽ bằng StatCard có sẵn ──
function Scoreboard({
  today,
  trends,
}: {
  today: NonNullable<ReportDashboard['today']>
  trends: TrendData | null
}) {
  // Ưu tiên số liệu kỳ (trends) nếu có; fallback hôm nay (dashboard)
  const revenue = trends?.totals.revenue ?? today.revenue
  const sessions = trends?.totals.sessions ?? today.sessionsCreated
  const players = trends?.totals.players ?? today.sessionsCreated
  const revPerSession = trends?.totals.revenuePerSession ?? today.averagePayment

  // % tăng trưởng so với kỳ trước
  const revenueGrowth = trends && trends.comparison.previousRevenue > 0
    ? Math.round(((trends.comparison.currentRevenue - trends.comparison.previousRevenue) / trends.comparison.previousRevenue) * 100)
    : null

  return (
    <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <StatCard
        label="Doanh thu"
        value={money(revenue)}
        color="green"
        icon={Wallet}
        trend={revenueGrowth != null ? { value: revenueGrowth, label: 'so kỳ trước' } : undefined}
      />
      <StatCard
        label="Phiên chơi"
        value={String(sessions)}
        color="blue"
        icon={Timer}
        subtitle={today.completedSessions > 0 ? `${today.completedSessions} đã checkout` : undefined}
      />
      <StatCard
        label="Người chơi"
        value={String(players)}
        color="yellow"
        icon={Users}
      />
      <StatCard
        label="TB / phiên"
        value={money(revPerSession)}
        color="purple"
        icon={BarChart3}
      />
    </section>
  )
}

function ShiftReportPanel({
  shift,
}: {
  shift: NonNullable<ReportDashboard['currentShift']>
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="grid grid-cols-[6px_1fr]">
        <div className="bg-emerald-500" />
        <div className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-950 dark:text-white">
                <Target size={17} className="text-emerald-500" />
                Đối soát ca hiện tại
              </h2>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                Mở lúc {formatClock(shift.openedAt)}
              </p>
            </div>
            <Badge variant="success">Đang mở</Badge>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <MiniMetric label="Tiền đầu ca" value={money(shift.openingCash)} />
            <MiniMetric label="Tiền mặt thu" value={money(shift.cashRevenue)} />
            <MiniMetric label="Tiền mặt dự kiến" value={money(shift.expectedCash)} strong />
            <MiniMetric label="Giao dịch" value={String(shift.paymentCount)} />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <MiniMetric label="Đang chơi" value={String(shift.activeSessions)} />
            <MiniMetric label="Đã checkout" value={String(shift.completedSessions)} />
          </div>
        </div>
      </div>
    </section>
  )
}

function MiniMetric({
  label,
  value,
  strong,
}: {
  label: string
  value: string
  strong?: boolean
}) {
  return (
    <div className="rounded-lg bg-zinc-50 px-3 py-2 dark:bg-zinc-950">
      <p className="text-[11px] text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className={`mt-1 text-sm font-semibold tabular-nums ${
        strong ? 'text-emerald-600 dark:text-emerald-300' : 'text-zinc-950 dark:text-white'
      }`}
      >
        {value}
      </p>
    </div>
  )
}

function RecentPaymentRow({
  payment,
}: {
  payment: RevenuePayment
}) {
  const router = useRouter()
  return (
    <button
      type="button"
      onClick={() => {
        if (payment.invoiceId) router.push(`/invoices/${payment.invoiceId}`)
      }}
      disabled={!payment.invoiceId}
      className="grid w-full grid-cols-[1fr_auto] gap-3 px-4 py-3 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50 disabled:cursor-default disabled:hover:bg-transparent"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold text-zinc-950 dark:text-white">
            {payment.customerName}
          </p>
          <Badge variant="outline" size="sm">{paymentMethodLabel(payment.paymentMethod)}</Badge>
        </div>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          {formatClock(payment.paidAt)}
          {payment.invoiceNo ? ` · ${payment.invoiceNo}` : ''}
        </p>
      </div>
      <p className="self-center text-sm font-bold tabular-nums text-zinc-950 dark:text-white">
        {money(payment.grandTotal)}
      </p>
    </button>
  )
}

const paymentMethods: PaymentMethod[] = ['CASH', 'TRANSFER', 'CARD', 'MEMBER']

function paymentMethodLabelFor(method: PaymentMethod): string {
  return paymentMethodLabel(method)
}

const itemColors: Record<ItemType, string> = {
  PLAY_TIME: '#3b82f6', // blue-500
  MEMBERSHIP_FEE: '#a855f7', // purple-500
  PRODUCT: '#10b981', // emerald-500
  SERVICE: '#f59e0b', // amber-500
  DISCOUNT: '#ef4444', // red-500
  SURCHARGE: '#f43f5e', // rose-500
}

function buildPaymentSlices(rows: TrendData['byPaymentMethod']): Array<{ label: string; value: number; color: string }> {
  const methodColors: Record<PaymentMethod, string> = {
    CASH: '#10b981',
    TRANSFER: '#3b82f6',
    CARD: '#a855f7',
    MEMBER: '#f59e0b',
  }
  const map = new Map<string, number>()
  for (const row of rows) {
    if (row.paymentMethod) map.set(row.paymentMethod, Number(row._sum?.grandTotal ?? 0))
  }
  return paymentMethods
    .map((method) => ({ label: paymentMethodLabelFor(method), value: map.get(method) ?? 0, color: methodColors[method] }))
    .filter((d) => d.value > 0)
}

function buildItemSlices(items: ItemBreakdown): Array<{ label: string; value: number; color: string }> {
  const labels: Record<ItemType, string> = {
    PLAY_TIME: 'Giờ chơi',
    MEMBERSHIP_FEE: 'Phí hội viên',
    PRODUCT: 'Hàng hóa',
    SERVICE: 'Dịch vụ',
    DISCOUNT: 'Giảm giá',
    SURCHARGE: 'Phí gửi xe',
  }
  return (Object.keys(labels) as ItemType[])
    .map((type) => ({ label: labels[type], value: items[type], color: itemColors[type] }))
    .filter((d) => d.value > 0)
}

function formatReportDate(value: string): string {
  const [, month, day] = value.split('-')
  return `${day}/${month}`
}
