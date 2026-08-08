'use client'

import type { ReactNode, MouseEvent } from 'react'
import { ArrowUpDown } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { EmptyState } from './empty-state'
import { Button } from './button'
import { useTableSort } from '@/hooks/use-table-sort'

// ── Types ──

export interface Column<T> {
  key?: string
  label: string
  headerClassName?: string
  cellClassName?: string
  render: (item: T) => ReactNode
}

export interface PaginationProps {
  page: number
  totalPages: number
  total: number
  onPageChange: (page: number) => void
}

// ── Sub-components ──

/**
 * Column header đơn lẻ — tự hiển thị mũi tên sort khi active.
 * Tách riêng để có thể dùng độc lập nếu render header ở ngoài.
 */
export function SortableHeader({
  label,
  sortKey,
  currentSortKey,
  sortDir,
  onToggle,
  className = '',
}: {
  label: string
  sortKey: string
  currentSortKey: string
  sortDir: 'asc' | 'desc'
  onToggle: (key: string) => void
  className?: string
}) {
  const active = currentSortKey === sortKey
  return (
    <th
      className={`cursor-pointer select-none py-3 px-3 text-left ${className}`}
      onClick={() => onToggle(sortKey)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <ArrowUpDown
          size={12}
          className={`shrink-0 transition-colors ${
            active ? 'text-blue-500' : 'text-zinc-300 dark:text-zinc-600'
          }`}
        />
      </span>
    </th>
  )
}

/**
 * Single table row — render từng cell qua columns.
 * Thêm `onRowClick` nếu cần bắt sự kiện click row.
 */
export function SortableTableRow<T>({
  item,
  columns,
  onRowClick,
}: {
  item: T
  columns: Column<T>[]
  onRowClick?: (item: T) => void
}) {
  function handleClick(e: MouseEvent) {
    // Không fire nếu user click vào button/link con
    const target = e.target as HTMLElement
    if (target.closest('button') || target.closest('a')) return
    onRowClick?.(item)
  }

  return (
    <tr
      className={`transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50 ${
        onRowClick ? 'cursor-pointer' : ''
      }`}
      onClick={onRowClick ? handleClick : undefined}
    >
      {columns.map((col) => (
        <td
          key={col.key ?? col.label}
          className={`py-3 text-left ${col.cellClassName ?? 'px-3'}`}
        >
          {col.render(item)}
        </td>
      ))}
    </tr>
  )
}

/**
 * Pagination bar — nút Đầu/Trước/Sau/Cuối + text "Trang X/Y · N mục".
 */
export function TablePagination({
  page,
  totalPages,
  total,
  onPageChange,
}: PaginationProps) {
  if (totalPages <= 1) return null

  return (
    <div className="mt-3 flex items-center justify-between gap-3 text-sm">
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Trang {page}/{totalPages} · {total} mục
      </p>
      <div className="flex items-center gap-1">
        <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onPageChange(1)}>
          Đầu
        </Button>
        <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          Trước
        </Button>
        <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
          Sau
        </Button>
        <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => onPageChange(totalPages)}>
          Cuối
        </Button>
      </div>
    </div>
  )
}

// ── Main component ──

interface SortableTableProps<T> {
  columns: Column<T>[]
  data: T[]
  keyExtractor: (item: T) => string
  /** Tự động sort nội bộ khi có sortableKeys */
  sortableKeys?: string[]
  defaultSortKey?: string
  defaultSortDir?: 'asc' | 'desc'
  /** Override: sort thủ công từ consumer (không dùng khi đã có sortableKeys) */
  sortOverride?: {
    sorted: T[]
    sortKey: string
    sortDir: 'asc' | 'desc'
    onSortChange: (key: string) => void
  }
  emptyIcon?: LucideIcon
  emptyMessage?: string
  emptyDescription?: string
  pagination?: PaginationProps
  onRowClick?: (item: T) => void
  className?: string
}

export function SortableTable<T>({
  columns,
  data,
  keyExtractor,
  sortableKeys = [],
  defaultSortKey,
  defaultSortDir = 'desc',
  sortOverride,
  emptyIcon,
  emptyMessage = 'Không có dữ liệu',
  emptyDescription,
  pagination,
  onRowClick,
  className = '',
}: SortableTableProps<T>) {
  // ── Sort: ưu tiên override, fallback auto-sort ──
  const autoSort = useTableSort(data, sortableKeys, defaultSortKey, defaultSortDir)

  const sorted = sortOverride ? sortOverride.sorted : autoSort.sorted
  const sortKey = sortOverride ? sortOverride.sortKey : autoSort.sortKey
  const sortDir = sortOverride ? sortOverride.sortDir : autoSort.sortDir
  const onSortChange = sortOverride ? sortOverride.onSortChange : autoSort.toggle

  const sortableColumnKeys = sortableKeys

  return (
    <div className={className}>
      <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        {data.length === 0 ? (
          <div className="p-8">
            <EmptyState icon={emptyIcon} message={emptyMessage} description={emptyDescription} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 text-xs font-medium uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
                  {columns.map((col) => {
                    const isSortable = col.key && sortableColumnKeys.includes(col.key)
                    if (isSortable) {
                      return (
                        <SortableHeader
                          key={col.key}
                          label={col.label}
                          sortKey={col.key!}
                          currentSortKey={sortKey}
                          sortDir={sortDir}
                          onToggle={onSortChange}
                          className={col.headerClassName ?? ''}
                        />
                      )
                    }
                    return (
                      <th key={col.key ?? col.label} className={`py-3 px-3 text-left ${col.headerClassName ?? ''}`}>
                        {col.label}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
                {sorted.map((item) => (
                  <SortableTableRow
                    key={keyExtractor(item)}
                    item={item}
                    columns={columns}
                    onRowClick={onRowClick}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {pagination && (
        <TablePagination
          page={pagination.page}
          totalPages={pagination.totalPages}
          total={pagination.total}
          onPageChange={pagination.onPageChange}
        />
      )}
    </div>
  )
}
