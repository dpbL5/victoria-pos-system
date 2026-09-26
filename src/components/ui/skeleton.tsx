// ── Skeleton loading component ──────────────────────────
// Dùng cho loading state khi đang fetch data (table, card, text...)
// Shimmer overlay định nghĩa trong `globals.css` (`.skeleton::after`).

import Image from 'next/image'
import type { ReactNode } from 'react'

export function AppSkeleton() {
  return (
    <div className="flex min-h-full items-center justify-center bg-zinc-50 p-6 dark:bg-zinc-950" role="status" aria-label="Đang tải">
      <Image src="/logo.jpg" alt="" width={80} height={80} priority className="app-skeleton-logo rounded-2xl object-cover shadow-sm" />
    </div>
  )
}

interface SkeletonProps {
  className?: string
}

export function Skeleton({ className = '' }: SkeletonProps) {
  return <div className={`skeleton ${className}`} />
}

export function SkeletonPanel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 ${className}`}>
      {children}
    </div>
  )
}
