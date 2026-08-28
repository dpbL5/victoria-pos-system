// ── Skeleton loading component ──────────────────────────
// Dùng cho loading state khi đang fetch data (table, card, text...)
// Shimmer overlay định nghĩa trong `globals.css` (`.skeleton::after`).

import type { ReactNode } from 'react'

interface SkeletonProps {
  className?: string
}

export function Skeleton({ className = '' }: SkeletonProps) {
  return <div className={`skeleton ${className}`} />
}

export function SkeletonPage({
  children,
  maxWidth = 'max-w-6xl',
}: {
  children: ReactNode
  maxWidth?: string
}) {
  return (
    <div className="min-h-full bg-zinc-50 px-4 py-4 dark:bg-zinc-950 md:px-6 md:py-6">
      <div className={`mx-auto ${maxWidth} space-y-4`}>{children}</div>
    </div>
  )
}

export function SkeletonPanel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 ${className}`}>
      {children}
    </div>
  )
}

export function SkeletonStats({
  count = 4,
  className = 'grid grid-cols-2 gap-2 md:grid-cols-4',
}: {
  count?: number
  className?: string
}) {
  return (
    <div className={className}>
      {Array.from({ length: count }, (_, index) => (
        <SkeletonPanel key={index} className="space-y-2">
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="h-6 w-1/2" />
        </SkeletonPanel>
      ))}
    </div>
  )
}

export function SkeletonRows({ count = 4 }: { count?: number }) {
  return (
    <SkeletonPanel className="space-y-2">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="flex items-center justify-between gap-3 border-b border-zinc-100 py-3 last:border-b-0 dark:border-zinc-800/50">
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="h-8 w-16" />
        </div>
      ))}
    </SkeletonPanel>
  )
}
