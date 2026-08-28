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
  unitCost: number | null
  profit: number
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
          {loaded && items.length > 0 && (
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
        <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center gap-2 px-4 py-3">
            <Package size={16} className="text-blue-500" />
            <h3 className="text-sm font-semibold text-zinc-950 dark:text-white">
              Top sản phẩm
            </h3>
            {loaded && <span className="text-xs text-zinc-500 dark:text-zinc-400">{items.length} mặt hàng</span>}
          </div>
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
            {items.map((item, index) => (
              <div
                key={item.productId}
                className="grid grid-cols-[2rem_minmax(0,1fr)] items-start gap-3 px-4 py-3 sm:grid-cols-[2rem_minmax(0,1fr)_auto]"
              >
                <span className={`flex h-6 w-6 items-center justify-center rounded-md text-xs font-semibold tabular-nums ${
                  index < 3
                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
                    : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'
                }`}
                >
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-zinc-950 dark:text-white">
                    {item.name}
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    {item.sku ? `SKU: ${item.sku}` : 'Không có SKU'}
                    {' · '}
                    {item.quantitySold.toLocaleString('vi-VN')} bán
                    {item.unitCost != null ? ` · vốn ${money(item.unitCost)}` : ''}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                    <p className={`text-xs font-medium tabular-nums ${
                      item.profit >= 0
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-red-600 dark:text-red-400'
                    }`}
                    >
                      Lợi nhuận: {money(item.profit)}
                    </p>
                    <p className="text-sm font-semibold tabular-nums text-zinc-950 dark:text-white sm:hidden">
                      {money(item.revenue)}
                    </p>
                  </div>
                </div>
                <p className="hidden text-sm font-semibold tabular-nums text-zinc-950 dark:text-white sm:block">
                  {money(item.revenue)}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
