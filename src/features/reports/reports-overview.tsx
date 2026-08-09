'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { LucideIcon } from 'lucide-react'
import {
  Banknote,
  BarChart3,
  CreditCard,
  Download,
  RefreshCw,
  ReceiptText,
  Target,
  Timer,
  TrendingUp,
  Users,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Input, Label, Select } from '@/components/ui/input'
import { NoticeCard } from '@/components/ui/notice-card'
import { Skeleton } from '@/components/ui/skeleton'
import { apiJson } from '@/features/pos/api'
import { formatClock, money } from '@/features/pos/format'
import type { PaymentMethod, UserSession } from '@/features/pos/types'
import { toInputDate } from '@/lib/shared/utils'

type ItemType = 'PLAY_TIME' | 'MEMBERSHIP_FEE' | 'PRODUCT' | 'SERVICE' | 'DISCOUNT' | 'SURCHARGE'
type Scope = 'STAFF' | 'ALL'

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

interface ReportsOverviewProps {
  user: UserSession | null
}

export function ReportsOverview({ user }: ReportsOverviewProps) {
  const [dashboard, setDashboard] = useState<ReportDashboard | null>(null)
  const [revenue, setRevenue] = useState<RevenueData[]>([])
  const [revenueSummary, setRevenueSummary] = useState<RevenueSummary | null>(null)
  const [recentPayments, setRecentPayments] = useState<RevenuePayment[]>([])
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

  useEffect(() => {
    void loadDashboard()
  }, [loadDashboard])

  useEffect(() => {
    void loadRevenue(from, to)
  }, [from, to, loadRevenue])

  const canExport = user?.role === 'ADMIN'
  const currentShift = dashboard?.currentShift ?? null
  const today = dashboard?.today
  const maxRevenue = useMemo(
    () => Math.max(...revenue.map((item) => item.revenue), 1),
    [revenue]
  )

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
          action={
            <Button
              variant="secondary"
              size="sm"
              icon={RefreshCw}
              onClick={() => {
                void loadDashboard()
                void loadRevenue(from, to)
              }}
            >
              Thử lại
            </Button>
          }
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

      <section className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <ReportStat
          label="Doanh thu"
          value={money(today?.revenue)}
          Icon={Banknote}
          tone="emerald"
        />
        <ReportStat
          label="Giao dịch"
          value={String(today?.paymentCount ?? 0)}
          Icon={ReceiptText}
          tone="blue"
        />
        <ReportStat
          label="Đang chơi"
          value={String(today?.activeSessions ?? 0)}
          Icon={Timer}
          tone="amber"
        />
        <ReportStat
          label="Khách mới"
          value={String(today?.newCustomers ?? 0)}
          Icon={Users}
          tone="purple"
        />
      </section>

      {currentShift && (
        <ShiftReportPanel shift={currentShift} />
      )}

      {today && (
        <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <BreakdownPanel
            title="Nguồn doanh thu hôm nay"
            items={buildItemRows(today.byItemType)}
            total={today.revenue}
          />
          <PaymentPanel
            title="Phương thức thanh toán"
            breakdown={today.byPaymentMethod}
          />
        </section>
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
            <div className="space-y-3">
              {revenue.map((item) => (
                <RevenueRow
                  key={item.period}
                  item={item}
                  maxRevenue={maxRevenue}
                />
              ))}
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

function ReportStat({
  label,
  value,
  Icon,
  tone,
}: {
  label: string
  value: string
  Icon: LucideIcon
  tone: 'emerald' | 'blue' | 'amber' | 'purple'
}) {
  const toneClasses = {
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300',
    blue: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300',
    amber: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300',
    purple: 'border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-500/20 dark:bg-purple-500/10 dark:text-purple-300',
  }[tone]

  return (
    <div className={`rounded-xl border p-3 shadow-sm ${toneClasses}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-medium opacity-80">{label}</p>
        <Icon size={16} className="shrink-0 opacity-80" />
      </div>
      <p className="mt-2 text-xl font-bold tabular-nums">
        {value}
      </p>
    </div>
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

function BreakdownPanel({
  title,
  items,
  total,
}: {
  title: string
  items: Array<{ label: string; value: number; color: string }>
  total: number
}) {
  const max = Math.max(...items.map((item) => item.value), 1)

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-zinc-950 dark:text-white">{title}</h2>
        <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{money(total)}</span>
      </div>
      <div className="mt-4 space-y-3">
        {items.map((item) => (
          <MetricBar
            key={item.label}
            label={item.label}
            value={money(item.value)}
            width={`${Math.round((item.value / max) * 100)}%`}
            color={item.color}
          />
        ))}
      </div>
    </section>
  )
}

function PaymentPanel({
  title,
  breakdown,
}: {
  title: string
  breakdown: PaymentBreakdown
}) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-sm font-semibold text-zinc-950 dark:text-white">{title}</h2>
      <div className="mt-4 space-y-3">
        {paymentMethods.map((method) => (
          <div key={method} className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                {method === 'CASH' ? <Banknote size={15} /> : method === 'MEMBER' ? <Users size={15} /> : <CreditCard size={15} />}
              </div>
              <div>
                <p className="text-sm font-medium text-zinc-950 dark:text-white">
                  {paymentMethodLabel(method)}
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {breakdown[method].count} giao dịch
                </p>
              </div>
            </div>
            <p className="text-sm font-semibold tabular-nums text-zinc-950 dark:text-white">
              {money(breakdown[method].total)}
            </p>
          </div>
        ))}
      </div>
    </section>
  )
}

function MetricBar({
  label,
  value,
  width,
  color,
}: {
  label: string
  value: string
  width: string
  color: string
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="text-zinc-500 dark:text-zinc-400">{label}</span>
        <span className="font-semibold tabular-nums text-zinc-950 dark:text-white">{value}</span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
        <div className={`h-full rounded-full ${color}`} style={{ width }} />
      </div>
    </div>
  )
}

function RevenueRow({
  item,
  maxRevenue,
}: {
  item: RevenueData
  maxRevenue: number
}) {
  const width = `${Math.max(4, Math.round((item.revenue / maxRevenue) * 100))}%`

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-zinc-950 dark:text-white">
            {formatReportDate(item.period)}
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {item.sessionCount} giao dịch · TB {money(item.avgRevenuePerSession)}
          </p>
        </div>
        <p className="text-sm font-bold tabular-nums text-emerald-600 dark:text-emerald-300">
          {money(item.revenue)}
        </p>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
        <div className="h-full rounded-full bg-emerald-500" style={{ width }} />
      </div>
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

function paymentMethodLabel(method: PaymentMethod): string {
  if (method === 'CASH') return 'Tiền mặt'
  if (method === 'TRANSFER') return 'Chuyển khoản'
  if (method === 'CARD') return 'Thẻ'
  return 'Hội viên'
}

function buildItemRows(items: ItemBreakdown) {
  return [
    { label: 'Giờ chơi', value: items.PLAY_TIME, color: 'bg-blue-500' },
    { label: 'Phí hội viên', value: items.MEMBERSHIP_FEE, color: 'bg-purple-500' },
    { label: 'Hàng hóa', value: items.PRODUCT, color: 'bg-emerald-500' },
    { label: 'Dịch vụ', value: items.SERVICE, color: 'bg-amber-500' },
    { label: 'Giảm giá', value: items.DISCOUNT, color: 'bg-red-500' },
    { label: 'Phí gửi xe', value: items.SURCHARGE, color: 'bg-rose-500' },
  ]
}

function formatReportDate(value: string): string {
  const [, month, day] = value.split('-')
  return `${day}/${month}`
}
