'use client'

import { type ReactNode } from 'react'

interface FilterButtonProps {
  active: boolean
  onClick: () => void
  children: ReactNode
}

export function FilterButton({ active, onClick, children }: FilterButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-1 ${
        active
          ? 'border-info-border bg-info-bg text-info'
          : 'border-border-default bg-surface-elevated text-text-secondary hover:bg-surface-tertiary'
      }`}
    >
      {children}
    </button>
  )
}
