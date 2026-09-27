'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'
import { Search } from 'lucide-react'
import { apiJson } from '@/lib/api'
import type { Customer } from './types'

const DROPDOWN_GAP = 4
const DROPDOWN_MAX_HEIGHT = 260
/** Dưới ngưỡng này thì lật dropdown lên trên ô nhập */
const MIN_SPACE_BELOW = 180

interface DropdownPosition {
  top?: number
  bottom?: number
  left: number
  width: number
  maxHeight: number
}

/**
 * Thanh tìm khách dùng chung cho Bán lẻ và Check-in.
 * Gõ tới đâu tìm tới đó (debounce 300ms) và đổ kết quả ngay dưới ô nhập.
 *
 * Kết quả render qua portal + position fixed: modal có vùng cuộn riêng
 * (`overflow-y-auto`), nếu để dropdown absolute bên trong thì bị cắt mất —
 * nhất là khi ô nhập nằm gần đáy modal. Tự lật lên trên khi hết chỗ bên dưới.
 */
export function CustomerSearch<T extends Customer>({
  value,
  onValueChange,
  onSelect,
  query,
  limit = 6,
  placeholder = 'Tìm tên hoặc SĐT...',
  emptyText = 'Không tìm thấy khách',
  renderItem,
  className = '',
}: {
  value: string
  onValueChange: (value: string) => void
  onSelect: (customer: T) => void
  /** Query phụ ngoài `search`, ví dụ `type=MEMBER&includeMembershipStatus=true` */
  query?: string
  limit?: number
  placeholder?: string
  emptyText?: string
  /** Nội dung một dòng kết quả; mặc định: tên bên trái, loại khách bên phải */
  renderItem?: (customer: T) => ReactNode
  className?: string
}) {
  const [results, setResults] = useState<T[]>([])
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<DropdownPosition | null>(null)
  const anchorRef = useRef<HTMLDivElement>(null)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showResults = open && value.trim().length > 0

  useEffect(() => {
    const keyword = value.trim()
    if (!showResults) return

    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(async () => {
      try {
        const extra = query ? `&${query}` : ''
        const data = await apiJson<T[]>(
          `/api/customers?search=${encodeURIComponent(keyword)}&limit=${limit}${extra}`,
        )
        setResults(data.success ? (data.data ?? []) : [])
      } catch {
        setResults([])
      }
    }, 300)

    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current)
    }
  }, [value, showResults, query, limit])

  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current
    if (!anchor) return
    const rect = anchor.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom - DROPDOWN_GAP - 8
    const spaceAbove = rect.top - DROPDOWN_GAP - 8
    const openUp = spaceBelow < MIN_SPACE_BELOW && spaceAbove > spaceBelow

    setPosition(
      openUp
        ? {
            bottom: window.innerHeight - rect.top + DROPDOWN_GAP,
            left: rect.left,
            width: rect.width,
            maxHeight: Math.min(DROPDOWN_MAX_HEIGHT, spaceAbove),
          }
        : {
            top: rect.bottom + DROPDOWN_GAP,
            left: rect.left,
            width: rect.width,
            maxHeight: Math.min(DROPDOWN_MAX_HEIGHT, spaceBelow),
          },
    )
  }, [])

  // Modal cuộn được nên vị trí phải tính lại theo scroll/resize
  useEffect(() => {
    if (!showResults) return
    updatePosition()
    window.addEventListener('scroll', updatePosition, true)
    window.addEventListener('resize', updatePosition)
    return () => {
      window.removeEventListener('scroll', updatePosition, true)
      window.removeEventListener('resize', updatePosition)
    }
  }, [showResults, updatePosition])

  return (
    <>
      <div ref={anchorRef} className={`relative ${className}`}>
        <Search
          size={14}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
        />
        <input
          type="text"
          value={value}
          onChange={(event) => {
            onValueChange(event.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="h-9 w-full rounded-lg border border-zinc-200 bg-transparent pl-8 pr-3 text-sm outline-none focus:border-zinc-400 dark:border-zinc-800 dark:focus:border-zinc-600"
        />
      </div>

      {showResults && position
        ? createPortal(
            <div
              style={{
                position: 'fixed',
                top: position.top,
                bottom: position.bottom,
                left: position.left,
                width: position.width,
                maxHeight: position.maxHeight,
              }}
              className="z-[70] overflow-y-auto rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-800 dark:bg-zinc-900"
            >
              {results.length === 0 ? (
                <p className="px-3 py-2 text-sm text-zinc-500 dark:text-zinc-400">
                  {emptyText}
                </p>
              ) : (
                results.map((customer) => (
                  <button
                    key={customer.id}
                    type="button"
                    onClick={() => {
                      onSelect(customer)
                      setOpen(false)
                    }}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  >
                    {renderItem ? (
                      renderItem(customer)
                    ) : (
                      <>
                        <span className="truncate font-medium text-zinc-950 dark:text-white">
                          {customer.fullName}
                        </span>
                        <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">
                          {customer.type === 'MEMBER' ? 'Hội viên' : 'Vãng lai'}
                        </span>
                      </>
                    )}
                  </button>
                ))
              )}
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
