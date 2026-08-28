'use client'

import { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  BarChart3,
  ChevronRight,
  Download,
  ReceiptText,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Input, Label, Select } from '@/components/ui/input'
import { NoticeCard } from '@/components/ui/notice-card'
import { Skeleton, SkeletonPanel, SkeletonStats } from '@/components/ui/skeleton'
import { apiJson } from '@/lib/api'
import { formatClock, money, paymentMethodLabel } from '@/features/pos/format'
import type { PaymentMethod, UserSession } from '@/features/pos/types'
import { toInputDate } from '@/lib/shared/utils'
import { AreaChart, DonutChart, HourlyBarChart, DailyVolumeChart } from './reports-charts'
import { isAdminOnly } from '@/lib/shared/roles'

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
    revenuePerPlayer: number
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

  const canExport = isAdminOnly(user?.role)
  const today = dashboard?.today
  // Khoảng 1 ngày lịch → hero chart chuyển sang granularity giờ (HourlyBarChart).
  const singleDay = isSingleDay(from, to)

  const applyRange = (nextRange: Range) => {
    setRange(nextRange)
    const active = RANGES.find((r) => r.key === nextRange)!
    const end = new Date()
    const start = new Date()
    start.setDate(end.getDate() - active.days + 1)
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

      {/* Cụm chọn khoảng thời gian — gom 3 cách chọn cùng kỳ vào 1 card, full width */}
      <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Khoảng thời gian
            </p>
            <p className="mt-0.5 text-sm font-semibold text-zinc-950 dark:text-white">
              {rangeLabel(range, from, to)}
            </p>
          </div>
          <RangeTabs range={range} onChange={applyRange} />
        </div>
        <details className="mt-3 group">
          <summary className="flex cursor-pointer items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 [&::-webkit-details-marker]:hidden">
            <span>Tuỳ chỉnh ngày</span>
            <ChevronRight size={12} className="transition-transform group-open:rotate-90" />
          </summary>
          <div className="mt-3 grid grid-cols-2 gap-3">
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
          <div className="mt-3 flex justify-end">
            <Button variant="inverse" size="xs" disabled={revenueLoading} onClick={() => void loadRevenue(from, to)}>
              {revenueLoading ? 'Đang tải' : 'Xem'}
            </Button>
          </div>
        </details>
      </section>

      {/* Layout 2/3 + 1/3 — main: monitor focal (scoreboard + chart + lưu lượng);
          side: phân tích cơ cấu + recent + xuất báo cáo. Mobile: stack dọc. */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* ── Main column (2/3) — monitor focal ── */}
        <div className="space-y-4 md:col-span-2">
          {/* Hero scoreboard — doanh thu là focal point */}
          {today && <HeroScoreboard today={today} trends={trends} />}

          {/* Hero chart: 1 ngày → doanh thu theo giờ; nhiều ngày → doanh thu theo ngày */}
          <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-start justify-between gap-3 p-4 pb-3">
              <div>
                <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-950 dark:text-white">
                  <TrendingUp size={17} className="text-emerald-500" />
                  {singleDay ? 'Doanh thu theo giờ' : 'Doanh thu theo ngày'}
                </h2>
                <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                  {dashboard?.scope === 'STAFF' ? 'Số liệu của ca và tài khoản của bạn' : 'Số liệu toàn bộ hệ thống'}
                </p>
              </div>
              <Badge variant="outline">
                {revenueSummary ? money(revenueSummary.totalRevenue) : money(0)}
              </Badge>
            </div>

            <div className="px-4 pb-5">
              {revenueLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-14 w-full" />
                  <Skeleton className="h-14 w-full" />
                </div>
              ) : singleDay ? (
                // 1 ngày: lấy từ trends.byHour (granularity giờ). Fallback rỗng khi chưa có trends.
                trends && trends.byHour.length > 0 ? (
                  <div className="rounded-xl border border-zinc-100 bg-zinc-50/50 p-3 dark:border-zinc-800 dark:bg-zinc-950/40">
                    <HourlyBarChart data={trends.byHour} height={220} />
                  </div>
                ) : (
                  <EmptyState
                    icon={BarChart3}
                    message="Chưa có doanh thu trong ngày"
                    description="Chưa có giao dịch nào được ghi nhận hôm nay."
                  />
                )
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
                    height={200}
                  />
                </div>
              )}
            </div>
          </section>

          {/* Lưu lượng theo ngày (người chơi + phiên) */}
          {trends && (
            <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <h2 className="text-sm font-semibold text-zinc-950 dark:text-white">Lưu lượng theo ngày</h2>
              <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                Số người chơi và số phiên trong kỳ
              </p>
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
          )}
        </div>

        {/* ── Side column (1/3) — phân tích + tác vụ ── */}
        <div className="space-y-4">
          {trends && (
            <>
              {/* Cơ cấu doanh thu — 2 donut xếp dọc */}
              <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                <h2 className="text-sm font-semibold text-zinc-950 dark:text-white">Cơ cấu doanh thu</h2>
                <div className="mt-4 space-y-5">
                  <div>
                    <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      Phương thức thanh toán
                    </h3>
                    <div className="mt-2">
                      <DonutChart
                        data={buildPaymentSlices(trends.byPaymentMethod)}
                        size={160}
                        centerValue={money(trends.totals.revenue, false)}
                      />
                    </div>
                  </div>
                  <div className="border-t border-zinc-100 pt-4 dark:border-zinc-800">
                    <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      Nguồn doanh thu
                    </h3>
                    <div className="mt-2">
                      <DonutChart
                        data={buildItemSlices(trends.byItemType)}
                        size={160}
                        centerValue={money(trends.totals.revenue, false)}
                      />
                    </div>
                  </div>
                </div>
              </section>
            </>
          )}

          {/* Giao dịch gần đây — compact trong side column */}
          {recentPayments.length > 0 && (
            <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <header className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
                <h2 className="text-sm font-semibold text-zinc-950 dark:text-white">
                  Giao dịch gần đây
                </h2>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  {recentPayments.length}
                </span>
              </header>
              <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {recentPayments.slice(0, 5).map((payment) => (
                  <RecentPaymentRow key={payment.id} payment={payment} />
                ))}
              </div>
            </section>
          )}

          {/* Xuất báo cáo — gọn, đặt cuối side column */}
          <section className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center gap-2">
              <Download size={16} className="text-zinc-400" />
              <span className="text-sm font-semibold text-zinc-950 dark:text-white">Xuất báo cáo</span>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {canExport ? 'Tải CSV cho khoảng ngày đã chọn' : 'Chỉ quản trị viên được tải file báo cáo'}
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Select
                value={exportType}
                onChange={(event) => setExportType(event.target.value)}
                disabled={!canExport}
                className="min-w-0 flex-1"
              >
                <option value="revenue">Doanh thu</option>
                <option value="sessions">Phiên chơi</option>
              </Select>
              {canExport ? (
                <a
                  href={`/api/reports/export?type=${exportType}&from=${from}&to=${to}`}
                  className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white sm:w-auto"
                >
                  <Download size={16} />
                  CSV
                </a>
              ) : (
                <button
                  type="button"
                  disabled
                  className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-zinc-200 px-3 py-2 text-sm font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500 sm:w-auto"
                >
                  <Download size={16} />
                  CSV
                </button>
              )}
            </div>
          </section>
        </div>
      </div>

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
      <SkeletonPanel><Skeleton className="h-16 w-full" /></SkeletonPanel>
      <SkeletonStats />
      <SkeletonPanel><Skeleton className="h-72 w-full" /></SkeletonPanel>
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

// ── HeroScoreboard: 1 doanh thu focal (số to + growth badge) + 3 chỉ số phụ ──
function HeroScoreboard({
  today,
  trends,
}: {
  today: NonNullable<ReportDashboard['today']>
  trends: TrendData | null
}) {
  // Ưu tiên số liệu kỳ (trends) nếu có; fallback hôm nay (dashboard)
  const revenue = trends?.totals.revenue ?? today.revenue
  const players = trends?.totals.players ?? today.sessionsCreated
  const sessions = trends?.totals.sessions ?? today.sessionsCreated
  const revPerPlayer = trends?.totals.revenuePerPlayer ?? today.averagePayment

  // % tăng trưởng so với kỳ trước
  const revenueGrowth = trends && trends.comparison.previousRevenue > 0
    ? Math.round(((trends.comparison.currentRevenue - trends.comparison.previousRevenue) / trends.comparison.previousRevenue) * 100)
    : null

  return (
    <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      {/* Focal: doanh thu — số to, growth badge, dải emerald */}
      <div className="relative overflow-hidden p-4 before:absolute before:left-0 before:top-0 before:h-full before:w-1 before:bg-emerald-500 sm:p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Doanh thu kỳ
            </p>
            <p className="mt-1 text-3xl font-extrabold tracking-tight text-zinc-950 dark:text-white tabular-nums md:text-4xl">
              {money(revenue)}
            </p>
          </div>
          {revenueGrowth != null && (
            <span
              className={`inline-flex w-fit items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
                revenueGrowth >= 0
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                  : 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300'
              }`}
            >
              {revenueGrowth >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
              {revenueGrowth >= 0 ? '+' : ''}{revenueGrowth}%
              <span className="font-normal text-zinc-500 dark:text-zinc-400">vs kỳ trước</span>
            </span>
          )}
        </div>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          {today.invoiceCount} hóa đơn · {today.paymentCount} giao dịch
        </p>
      </div>

      {/* Các chỉ số phụ — Người chơi (focal phụ) + Phiên + TB/người */}
      <div className="grid grid-cols-3 divide-x divide-zinc-200 border-t border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
        <SupportStat
          label="Người chơi"
          value={String(players)}
          hint={today.completedSessions > 0 ? `${today.completedSessions} phiên đã checkout` : undefined}
        />
        <SupportStat
          label="Phiên"
          value={String(sessions)}
        />
        <SupportStat
          label="TB / người"
          value={money(revPerPlayer)}
        />
      </div>
    </section>
  )
}

function SupportStat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="px-3 py-3 text-center">
      <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {label}
      </p>
      <p className="mt-0.5 text-lg font-bold tabular-nums text-zinc-950 dark:text-white">
        {value}
      </p>
      {hint ? (
        <p className="mt-0.5 text-[10px] text-zinc-500 dark:text-zinc-400">{hint}</p>
      ) : null}
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

function rangeLabel(range: Range, from: string, to: string): string {
  if (range === 'today') return 'Hôm nay'
  if (range === '7d') return '7 ngày gần nhất'
  if (range === '30d') return '30 ngày gần nhất'
  // Tuỳ chỉnh: hiển thị khoảng ngày
  return `${formatReportDate(from)} – ${formatReportDate(to)}`
}

/** Khoảng chỉ chứa 1 ngày lịch — dùng để đổi granularity của hero chart sang giờ. */
function isSingleDay(from: string, to: string): boolean {
  return from === to
}
