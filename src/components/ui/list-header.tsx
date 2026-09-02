'use client'

import type { ReactNode } from 'react'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'

export interface ListSearchConfig<T> {
  placeholder?: string
  getText: (item: T) => string
}

interface ListHeaderProps {
  children?: ReactNode
  search?: {
    value: string
    onChange: (value: string) => void
    placeholder?: string
    ariaLabel: string
  }
}

export function ListHeader({ children, search }: ListHeaderProps) {
  if (!children && !search) return null

  return (
    <div className="flex flex-col gap-2 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
      <div className={search ? 'flex flex-col gap-2 sm:flex-row sm:items-center' : ''}>
        {children && <div className="min-w-0 flex-1">{children}</div>}
        {search && (
          <div className="relative w-full sm:max-w-xs">
            <Search
              size={14}
              aria-hidden
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500"
            />
            <Input
              type="search"
              value={search.value}
              onChange={(event) => search.onChange(event.target.value)}
              placeholder={search.placeholder ?? 'Tìm kiếm...'}
              aria-label={search.ariaLabel}
              className="pl-8 text-sm"
            />
          </div>
        )}
      </div>
    </div>
  )
}
