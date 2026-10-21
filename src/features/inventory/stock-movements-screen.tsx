'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Package } from 'lucide-react'
import { Badge, type BadgeVariant } from '@/components/ui/badge'
import { FilterButton } from '@/components/ui/filter-button'
import { NoticeCard } from '@/components/ui/notice-card'
import { PAGE_TITLE_CLASS } from '@/components/ui/page-title'
import { AppSkeleton } from '@/components/ui/skeleton'
import { SortableCardList, type Column as CardColumn } from '@/components/ui/sortable-card-list'
import { SortableTable, type Column } from '@/components/ui/sortable-table'
import { usePageRefresh } from '@/components/layout/page-refresh-context'
import { useApi } from '@/hooks/use-api'
import { formatVnDateTime } from '@/lib/shared/utils'
import type { StockMovementRow, StockMovementType, StockSaleChannel } from '@/types'

type MovementFilter = 'ALL' | StockMovementType

const TYPE_LABELS: Record<StockMovementType, string> = {
  RESTOCK: 'Nhập kho',
  ADJUSTMENT: 'Điều chỉnh',
  SALE: 'Bán ra',
  VOID: 'Hoàn kho',
}

const TYPE_VARIANTS: Record<StockMovementType, BadgeVariant> = {
  RESTOCK: 'success',
  ADJUSTMENT: 'warning',
  SALE: 'blue',
  VOID: 'default',
}

const CHANNEL_LABELS: Record<StockSaleChannel, string> = {
  RETAIL: 'Bán lẻ',
  SESSION: 'Bán kèm',
}

export function StockMovementsScreen() {
  const [filter, setFilter] = useState<MovementFilter>('ALL')
  const { data, isLoading, mutate } = useApi<StockMovementRow[]>('/api/stock-movements', {
    dedupingInterval: 60_000,
  })
  const { registerRefresh } = usePageRefresh()

  useEffect(() => {
    return registerRefresh(() => void mutate())
  }, [registerRefresh, mutate])

  const rows = useMemo(() => data?.data ?? [], [data])
  const error = !data?.success ? (data?.error as string ?? '') : ''

  const filteredRows = useMemo(
    () => (filter === 'ALL' ? rows : rows.filter((row) => row.type === filter)),
    [rows, filter],
  )

  const movementColumns: Column<StockMovementRow>[] = useMemo(() => [
    {
      key: 'productName',
      label: 'Mặt hàng',
      cellClassName: 'px-4 py-3 font-medium text-zinc-950 dark:text-white',
      render: (item) => (
        <div className="flex flex-wrap items-center gap-2">
          <span className="whitespace-nowrap">{item.productName}</span>
          <MovementBadges item={item} />
        </div>
      ),
    },
    {
      key: 'quantity',
      label: 'Số lượng',
      cellClassName: 'px-4 py-3 text-sm tabular-nums',
      render: (item) => <QuantityValue quantity={item.quantity} />,
    },
    {
      key: 'createdAt',
      label: 'Thời gian',
      cellClassName: 'px-4 py-3 text-xs text-zinc-500 dark:text-zinc-400',
      render: (item) => formatVnDateTime(item.createdAt),
    },
    {
      key: 'staffName',
      label: 'Nhân viên',
      cellClassName: 'px-4 py-3 text-sm',
      render: (item) => item.staffName ?? '—',
    },
    {
      key: 'invoiceNo',
      label: 'Hoá đơn',
      cellClassName: 'px-4 py-3 text-xs text-zinc-500 dark:text-zinc-400',
      render: (item) => item.invoiceNo ?? '—',
    },
    {
      key: 'reason',
      label: 'Lý do',
      cellClassName: 'px-4 py-3 text-xs text-zinc-500 dark:text-zinc-400',
      render: (item) => item.reason ?? '—',
    },
  ], [])

  const movementCardColumns: CardColumn<StockMovementRow>[] = useMemo(() => [
    {
      key: 'productName',
      label: 'Mặt hàng',
      render: (item) => (
        <span className="flex flex-wrap items-center gap-2 text-base font-semibold text-zinc-950 dark:text-white">
          <span className="whitespace-nowrap">{item.productName}</span>
          <MovementBadges item={item} />
        </span>
      ),
    },
    {
      key: 'quantity',
      label: 'Số lượng',
      render: (item) => <QuantityValue quantity={item.quantity} />,
    },
    {
      key: 'createdAt',
      label: 'Thời gian',
      render: (item) => formatVnDateTime(item.createdAt),
    },
    {
      key: 'staffName',
      label: 'Nhân viên',
      render: (item) => item.staffName ?? '—',
    },
    {
      key: 'invoiceNo',
      label: 'Hoá đơn',
      render: (item) => item.invoiceNo ?? '—',
    },
    {
      key: 'reason',
      label: 'Lý do',
      render: (item) => item.reason ?? '—',
    },
  ], [])

  if (isLoading) {
    return <AppSkeleton />
  }

  const listHeader = (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-zinc-950 dark:text-white">
            Biến động kho
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {filteredRows.length} giao dịch · mới nhất trước
          </p>
        </div>
      </div>
      <div role="group" aria-label="Lọc giao dịch kho" className="flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
        <FilterButton active={filter === 'ALL'} onClick={() => setFilter('ALL')}>Tất cả</FilterButton>
        <FilterButton active={filter === 'RESTOCK'} onClick={() => setFilter('RESTOCK')}>Nhập kho</FilterButton>
        <FilterButton active={filter === 'ADJUSTMENT'} onClick={() => setFilter('ADJUSTMENT')}>Điều chỉnh</FilterButton>
        <FilterButton active={filter === 'SALE'} onClick={() => setFilter('SALE')}>Bán ra</FilterButton>
        <FilterButton active={filter === 'VOID'} onClick={() => setFilter('VOID')}>Hoàn kho</FilterButton>
      </div>
    </div>
  )

  return (
    <div className="min-h-full bg-zinc-50 px-4 py-4 dark:bg-zinc-950 md:px-6 md:py-6">
      <div className="mx-auto max-w-content space-y-4">
        <div className="md:hidden">
          <BackButton />
        </div>

        <header className="hidden items-center justify-between gap-3 md:flex">
          <div className="min-w-0">
            <h1 className={PAGE_TITLE_CLASS}>
              Lịch sử giao dịch kho
            </h1>
          </div>
          <BackButton />
        </header>

        {error && (
          <NoticeCard
            tone="danger"
            title="Không tải được lịch sử kho"
            description={error}
          />
        )}

        {/* Mobile: card list */}
        <div className="md:hidden">
          <SortableCardList
            header={listHeader}
            columns={movementCardColumns}
            data={filteredRows}
            keyExtractor={(row) => row.id}
            search={{
              placeholder: 'Tìm tên mặt hàng',
              getText: (row) => `${row.productName} ${row.productSku ?? ''} ${row.invoiceNo ?? ''}`,
            }}
            sortableKeys={['productName', 'quantity', 'createdAt']}
            defaultSortKey="createdAt"
            defaultSortDir="desc"
            emptyIcon={Package}
            emptyMessage="Chưa có giao dịch kho"
            emptyDescription="Nhập kho, điều chỉnh hoặc bán hàng sẽ hiện ở đây."
          />
        </div>

        {/* Desktop: table */}
        <div className="hidden md:block">
          <SortableTable
            header={listHeader}
            columns={movementColumns}
            data={filteredRows}
            keyExtractor={(row) => row.id}
            search={{
              placeholder: 'Tìm tên mặt hàng',
              getText: (row) => `${row.productName} ${row.productSku ?? ''} ${row.invoiceNo ?? ''}`,
            }}
            sortableKeys={['productName', 'quantity', 'createdAt']}
            defaultSortKey="createdAt"
            defaultSortDir="desc"
            emptyIcon={Package}
            emptyMessage="Chưa có giao dịch kho"
            emptyDescription="Nhập kho, điều chỉnh hoặc bán hàng sẽ hiện ở đây."
          />
        </div>
      </div>
    </div>
  )
}

function MovementBadges({ item }: { item: StockMovementRow }) {
  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap">
      <Badge variant={TYPE_VARIANTS[item.type]} size="sm">{TYPE_LABELS[item.type]}</Badge>
      {item.channel && (
        <Badge variant="outline" size="sm">{CHANNEL_LABELS[item.channel]}</Badge>
      )}
    </span>
  )
}

function QuantityValue({ quantity }: { quantity: number }) {
  const positive = quantity > 0
  return (
    <span className={`font-semibold tabular-nums ${
      positive ? 'text-success' : 'text-danger'
    }`}
    >
      {positive ? `+${quantity}` : quantity}
    </span>
  )
}

function BackButton() {
  const router = useRouter()
  return (
    <button
      type="button"
      onClick={() => router.back()}
      className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
    >
      <ArrowLeft size={16} />
      Quay lại
    </button>
  )
}
