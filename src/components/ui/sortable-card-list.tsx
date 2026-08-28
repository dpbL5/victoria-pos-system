'use client'

import { useCallback } from 'react'
import { Users } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { KeyboardEvent } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { useTableSort } from '@/hooks/use-table-sort'

export interface Column<T> {
  key?: string
  label: string
  headerClassName?: string
  cellClassName?: string
  render: (item: T) => React.ReactNode
}

interface SortableCardListProps<T> {
  columns: Column<T>[]
  data: T[]
  keyExtractor: (item: T) => string
  sortableKeys?: string[]
  defaultSortKey?: string
  defaultSortDir?: 'asc' | 'desc'
  loading?: boolean
  loadingCount?: number
  emptyIcon?: LucideIcon
  emptyMessage?: string
  emptyDescription?: string
  header?: React.ReactNode
  onRowClick?: (item: T) => void
  renderActionFooter?: (item: T) => React.ReactNode
  /** Bọc title column trong thẻ heading. Mặc định là 'h3'. Đặt `null` để tắt. */
  headingLevel?: 1 | 2 | 3 | 4 | null
}

export function SortableCardList<T>({
  columns,
  data,
  keyExtractor,
  sortableKeys = [],
  defaultSortKey,
  defaultSortDir = 'desc',
  loading = false,
  loadingCount = 4,
  emptyIcon = Users,
  emptyMessage = 'Không có dữ liệu',
  emptyDescription,
  header,
  onRowClick,
  renderActionFooter,
  headingLevel = 3,
}: SortableCardListProps<T>) {
  const { sorted, sortKey, sortDir, toggle } = useTableSort(data, sortableKeys, defaultSortKey, defaultSortDir)

  const titleCol = columns[0]
  const actionCols = columns.filter((c) => !c.key)
  const detailCols = columns.slice(1).filter((c) => c.key)
  const interactive = !!onRowClick

  const handleKeyDown = useCallback(
    (item: T) => (e: KeyboardEvent<HTMLDivElement>) => {
      if ((e.key === 'Enter' || e.key === ' ') && onRowClick) {
        e.preventDefault()
        onRowClick(item)
      }
    },
    [onRowClick]
  )

  const TitleTag = headingLevel ? (`h${headingLevel}` as const) : 'div'
  const titleClassName = headingLevel ? 'm-0' : ''

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      {header}

      {/* Sort chips */}
      {data.length > 0 && sortableKeys.length > 0 && (
        <div
          role="group"
          aria-label="Sắp xếp danh sách"
          className="flex items-center gap-1.5 overflow-x-auto border-b border-zinc-100 px-3 py-2 dark:border-zinc-800"
        >
          <span className="mr-1 shrink-0 text-[11px] text-zinc-500 dark:text-zinc-400">Sắp xếp:</span>
          {sortableKeys.map((key) => {
            const col = columns.find((c) => c.key === key)
            const label = col?.label ?? key
            const active = sortKey === key
            return (
              <button
                key={key}
                type="button"
                aria-pressed={active}
                onClick={() => toggle(key)}
                className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-3 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 ${
                  active
                    ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/15 dark:text-blue-300'
                    : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800'
                }`}
              >
                {label}
                {active && <span className="text-[10px]" aria-hidden="true">{sortDir === 'asc' ? '↑' : '↓'}</span>}
              </button>
            )
          })}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div aria-busy="true" aria-label="Đang tải danh sách" className="space-y-3 p-3">
          <span className="sr-only">Đang tải dữ liệu...</span>
          {Array.from({ length: loadingCount }).map((_, i) => (
            <div key={i} aria-hidden="true" className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
              <Skeleton className="mb-3 h-5 w-2/3" />
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-4 w-1/3" />
                </div>
                <Skeleton className="h-10 w-20 rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty */}
      {!loading && data.length === 0 && (
        <div className="p-8">
          <EmptyState icon={emptyIcon} message={emptyMessage} description={emptyDescription} />
        </div>
      )}

      {/* Card list */}
      {!loading && sorted.length > 0 && (
        <ul role="list" className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
          {sorted.map((item) => (
            <li key={keyExtractor(item)}>
              <div
                {...(interactive
                  ? {
                      role: 'button',
                      tabIndex: 0,
                      onKeyDown: handleKeyDown(item),
                      onClick: () => onRowClick?.(item),
                    }
                  : {})}
                className={`motion-press w-full px-4 py-3.5 text-left hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 dark:hover:bg-zinc-800/50 ${
                  interactive ? 'cursor-pointer' : ''
                }`}
              >
                {/* ── Lưới: title (full top) | details (dưới trái) | actions + footer (dưới phải) ── */}
                <div className="grid grid-cols-2 items-start gap-x-3 gap-y-2">
                  {/* Title (trên, full width — gộp 2 ô top) */}
                  {titleCol && (
                    <div className="col-span-2 min-w-0">
                      <TitleTag className={titleClassName}>
                        {titleCol.render(item)}
                      </TitleTag>
                    </div>
                  )}

                  {/* Details (dưới trái) */}
                  {detailCols.length > 0 && (
                    <div className="flex min-w-0 flex-col gap-0.5">
                      {detailCols.map((col) => (
                        <div key={col.key} className="flex items-baseline gap-1.5 text-xs">
                          <span className="shrink-0 text-zinc-500 dark:text-zinc-400">
                            {col.label}
                          </span>
                          <span className={`min-w-0 truncate ${col.cellClassName ?? 'text-zinc-700 dark:text-zinc-300'}`}>
                            {col.render(item)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Actions + Footer (dưới phải) */}
                  {(actionCols.length > 0 || renderActionFooter) && (
                    <div
                      className="flex flex-col items-end gap-2"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                      role="presentation"
                    >
                      {actionCols.map((col, i) => (
                        <div key={i}>{col.render(item)}</div>
                      ))}
                      {renderActionFooter?.(item)}
                    </div>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
