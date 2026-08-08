'use client'

import { useMemo, useState } from 'react'

export interface UseTableSortResult<T> {
  sorted: T[]
  sortKey: string
  sortDir: 'asc' | 'desc'
  toggle: (key: string) => void
}

/**
 * Generic sort hook cho SortableTable.
 * Tự động nhận diện kiểu dữ liệu (string, number, date ISO string)
 * và dùng comparator phù hợp.
 */
export function useTableSort<T>(
  data: T[],
  sortableKeys: string[],
  defaultSortKey?: string,
  defaultSortDir: 'asc' | 'desc' = 'desc',
): UseTableSortResult<T> {
  const [sortKey, setSortKey] = useState<string>(defaultSortKey ?? sortableKeys[0] ?? '')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(defaultSortDir)

  const toggle = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  const sorted = useMemo(() => {
    if (!sortKey || sortableKeys.length === 0) return data
    const sorted = [...data]
    sorted.sort((a, b) => {
      const aVal = (a as Record<string, unknown>)[sortKey]
      const bVal = (b as Record<string, unknown>)[sortKey]

      let cmp = 0
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        cmp = aVal - bVal
      } else if (typeof aVal === 'string' && typeof bVal === 'string') {
        // ISO date strings
        const aTime = Date.parse(aVal)
        const bTime = Date.parse(bVal)
        if (!Number.isNaN(aTime) && !Number.isNaN(bTime)) {
          cmp = aTime - bTime
        } else {
          cmp = aVal.localeCompare(bVal, 'vi')
        }
      } else {
        cmp = String(aVal ?? '').localeCompare(String(bVal ?? ''), 'vi')
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return sorted
  }, [data, sortKey, sortDir, sortableKeys])

  return { sorted, sortKey, sortDir, toggle }
}
