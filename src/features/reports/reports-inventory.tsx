'use client'

// ── Báo cáo bán hàng từ kho — top sản phẩm bán chạy trong kỳ ──
// Nguồn: GET /api/reports/top-products (InvoiceItem type=PRODUCT, invoice PAID)

import { useCallback, useState } from 'react'
import { Package, PackageOpen, RefreshCw, TrendingUp } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Input, Label } from '@/components/ui/input'
import { NoticeCard } from '@/components/ui/notice-card'
import { Skeleton, SkeletonPanel } from '@/components/ui/skeleton'
import { money } from '@/features/pos/format'
import { toInputDate } from '@/lib/shared/utils'

interface TopProductRow {
  productId: string
  name: string
  sku: string | null
  quantitySold: number
  revenue: number
}

interface TopProductsResponse {
  success: boolean
  data?: { items: TopProductRow[] }
  error?: string
}

export function ReportsInventory() {
  const [from, setFrom] = useState(() => toInputDate(new Date()))
  const [to, setTo] = useState(() => toInputDate(new Date()))
  const [items, setItems] = useState<TopProductRow[]>([])
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async (nextFrom: string, nextTo: string) => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/reports/top-products?from=${nextFrom}&to=${nextTo}`)
      const data = await res.json() as TopProductsResponse

      if (!data.success) {
        setError(data.error || 'Không tải được báo cáo bán hàng')
        return
      }
      setItems(data.data?.items ?? [])
    } catch {
      setError('Lỗi kết nối máy chủ')
    } finally {
      setLoading(false)
      setLoaded(true)
    }
  }, [])

  const applyQuickRange = (days: number) => {
    const end = new Date()
    const start = new Date()
    start.setDate(end.getDate() - days + 1)
    const nextFrom = toInputDate(start)
    const nextTo = toInputDate(end)
    setFrom(nextFrom)
    setTo(nextTo)
    void load(nextFrom, nextTo)
  }

  const handleView = () => {
    void load(from, to)
  }

  const totalRevenue = items.reduce((sum, item) => sum + item.revenue, 0)
  const totalQuantity = items.reduce((sum, item) => sum + item.quantitySold, 0)
  const hasData = loaded && items.length > 0
  const [podium, rest] = items.length > 0
    ? [items.slice(0, 3), items.slice(3)]
    : [[], []]

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-950 dark:text-white">
              <TrendingUp size={17} className="text-emerald-500" />
              Bán hàng từ kho
            </h2>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Top sản phẩm bán chạy theo khoảng ngày
            </p>
          </div>
          {hasData && (
            <Badge variant="outline">{money(totalRevenue)}</Badge>
          )}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="inv-from">Từ ngày</Label>
            <Input
              id="inv-from"
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="inv-to">Đến ngày</Label>
            <Input
              id="inv-to"
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Button variant="secondary" size="sm" onClick={() => applyQuickRange(1)}>Hôm nay</Button>
          <Button variant="secondary" size="sm" onClick={() => applyQuickRange(7)}>7 ngày</Button>
          <Button variant="secondary" size="sm" onClick={() => applyQuickRange(30)}>30 ngày</Button>
          <Button variant="inverse" size="sm" disabled={loading} onClick={handleView}>
            {loading ? 'Đang tải' : 'Xem'}
          </Button>
        </div>
      </section>

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
              onClick={handleView}
            >
              Thử lại
            </Button>
          }
        />
      )}

      {loading ? (
        <SkeletonPanel className="space-y-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </SkeletonPanel>
      ) : loaded && items.length === 0 ? (
        <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <EmptyState
            icon={PackageOpen}
            message="Chưa có bán hàng trong khoảng ngày"
            description="Chọn khoảng ngày khác hoặc kiểm tra các hoá đơn đã thanh toán."
          />
        </section>
      ) : (
        <div className="space-y-4">
          {/* Hero: tổng quan kỳ */}
          <section className="rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex flex-wrap items-end justify-between gap-3 px-4 py-3 border-b border-zinc-100 dark:border-zinc-800/50">
              <div>
                <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Tổng quan kỳ
                </h3>
                <p className="mt-1 text-2xl font-bold tabular-nums text-zinc-950 dark:text-white">
                  {money(totalRevenue)}
                </p>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <div>
                  <span className="text-zinc-500 dark:text-zinc-400">Sản phẩm</span>
                  <p className="mt-0.5 text-sm font-semibold tabular-nums text-zinc-950 dark:text-white">
                    {items.length}
                  </p>
                </div>
                <div className="h-8 w-px bg-zinc-200 dark:bg-zinc-800" />
                <div>
                  <span className="text-zinc-500 dark:text-zinc-400">Số lượng bán</span>
                  <p className="mt-0.5 text-sm font-semibold tabular-nums text-zinc-950 dark:text-white">
                    {totalQuantity.toLocaleString('vi-VN')}
                  </p>
                </div>
              </div>
            </div>

            {/* Podium: top 3 */}
            <ol className="grid grid-cols-1 divide-y divide-zinc-100 border-zinc-100 sm:grid-cols-3 sm:divide-x sm:divide-y-0 dark:divide-zinc-800/50">
              {podium.map((item, index) => (
                <PodiumSlot key={item.productId} item={item} rank={index + 1} />
              ))}
            </ol>
          </section>

          {/* Phần còn lại (hạng 4+) dạng bảng xếp hạng thu gọn */}
          {rest.length > 0 && (
            <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex items-center justify-between gap-2 border-b border-zinc-100 px-4 py-2.5 dark:border-zinc-800/50">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-950 dark:text-white">
                  <Package size={15} className="text-blue-500" />
                  Còn lại
                </h3>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  {rest.length} mặt hàng
                </span>
              </div>
              <ul role="list" className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
                {rest.map((item, index) => (
                  <RankedRow
                    key={item.productId}
                    item={item}
                    rank={index + 4}
                  />
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  )
}

// ── Sub-components ──

function PodiumSlot({ item, rank }: { item: TopProductRow; rank: number }) {
  const rankTone = rank === 1
    ? 'bg-amber-500 text-white shadow-sm shadow-amber-500/30'
    : rank === 2
      ? 'bg-zinc-300 text-zinc-800 dark:bg-zinc-600 dark:text-zinc-100'
      : 'bg-orange-300 text-orange-900 dark:bg-orange-700/60 dark:text-orange-100'
  const revenueSize = rank === 1 ? 'text-xl' : 'text-base'

  return (
    <li className="px-4 py-3">
      <div className="flex items-center gap-2">
        <span
          aria-label={`Hạng ${rank}`}
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs font-bold tabular-nums ${rankTone}`}
        >
          {rank}
        </span>
        <div className="min-w-0 flex-1">
          <p className={`font-semibold text-zinc-950 dark:text-white ${rank === 1 ? 'text-base' : 'text-sm'}`}>
            <span className="line-clamp-1">{item.name}</span>
          </p>
          <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
            {item.quantitySold.toLocaleString('vi-VN')} bán
          </p>
        </div>
      </div>
      <p className={`mt-2 font-bold tabular-nums text-zinc-950 dark:text-white ${revenueSize}`}>
        {money(item.revenue)}
      </p>
    </li>
  )
}

function RankedRow({ item, rank }: { item: TopProductRow; rank: number }) {
  return (
    <li>
      <div className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-zinc-100 text-[11px] font-semibold tabular-nums text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
          {rank}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-zinc-950 dark:text-white">
            {item.name}
          </p>
          <p className="text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400">
            {item.quantitySold.toLocaleString('vi-VN')} bán
          </p>
        </div>
        <p className="text-sm font-semibold tabular-nums text-zinc-950 dark:text-white">
          {money(item.revenue)}
        </p>
      </div>
    </li>
  )
}
