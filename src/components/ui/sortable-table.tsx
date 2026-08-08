'use client'

import type { ReactNode } from 'react'
import { ArrowUpDown } from 'lucide-react'
import { EmptyState } from './empty-state'
import { Button } from './button'
import type { LucideIcon } from 'lucide-react'

// ── Types ──

export interface Column<T> {
  /** Sort key — bỏ qua nếu cột không sắp xếp được */
  key?: string
  label: string
  /** Class cho <th> */
  headerClassName?: string
  /** Class cho <td> */
  cellClassName?: string
  /** Render cell content */
  render: (item: T) => ReactNode
}

export interface PaginationProps {
  page: number
  totalPages: number
  total: number
  onPageChange: (page: number) => void
}

// ── Component ──

interface SortableTableProps<T> {
  columns: Column<T>[]
  data: T[]
  keyExtractor: (item: T) => string
  /** Current sort key */
  sortKey?: string
  sortDir?: 'asc' | 'desc'
  onSortChange?: (key: string) => void
  /** Hiển thị khi data rỗng */
  emptyIcon?: LucideIcon
  emptyMessage?: string
  emptyDescription?: string
  pagination?: PaginationProps
  className?: string
}

export function SortableTable<T>({
  columns,
  data,
  keyExtractor,
  sortKey,
  sortDir = 'desc',
  onSortChange,
  emptyIcon,
  emptyMessage = 'Không có dữ liệu',
  emptyDescription,
  pagination,
  className = '',
}: SortableTableProps<T>) {
  const showSort = !!onSortChange

  return (
    <div className={className}>
      <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        {data.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={emptyIcon}
              message={emptyMessage}
              description={emptyDescription}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 text-xs font-medium uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
                  {columns.map((col) => {
                    const sortable = showSort && !!col.key
                    const active = sortable && sortKey === col.key
                    return (
                      <th
                        key={col.key ?? col.label}
                        className={`${sortable ? 'cursor-pointer select-none' : ''} py-3 ${col.headerClassName ?? ''}`}
                        onClick={() => sortable && onSortChange?.(col.key!)}
                      >
                        {sortable ? (
                          <span className="inline-flex items-center gap-1">
                            {col.label}
                            <ArrowUpDown
                              size={12}
                              className={`shrink-0 transition-colors ${
                                active ? 'text-blue-500' : 'text-zinc-300 dark:text-zinc-600'
                              }`}
                            />
                          </span>
                        ) : (
                          col.label
                        )}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
                {data.map((item) => (
                  <tr
                    key={keyExtractor(item)}
                    className="transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                  >
                    {columns.map((col) => (
                      <td
                        key={col.key ?? col.label}
                        className={`py-3 ${col.cellClassName ?? 'px-3'}`}
                      >
                        {col.render(item)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {pagination && pagination.totalPages > 1 && (
        <div className="mt-3 flex items-center justify-between gap-3 text-sm">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Trang {pagination.page}/{pagination.totalPages} · {pagination.total} mục
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="secondary"
              size="sm"
              disabled={pagination.page <= 1}
              onClick={() => pagination.onPageChange(1)}
            >
              Đầu
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={pagination.page <= 1}
              onClick={() => pagination.onPageChange(pagination.page - 1)}
            >
              Trước
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => pagination.onPageChange(pagination.page + 1)}
            >
              Sau
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => pagination.onPageChange(pagination.totalPages)}
            >
              Cuối
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
