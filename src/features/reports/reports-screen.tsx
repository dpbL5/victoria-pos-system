'use client'

import { useEffect, useState } from 'react'
import { BarChart3, CalendarClock, RefreshCw } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { apiJson } from '@/lib/api'
import type { UserSession } from '@/features/pos/types'
import { ReportsOverview } from './reports-overview'

export function ReportsScreen() {
  const [user, setUser] = useState<UserSession | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const res = await apiJson<UserSession>('/api/auth/me')
        if (res.success && res.data) setUser(res.data)
      } catch {
        // không cần xử lý
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [])

  if (loading) {
    return (
      <div className="min-h-full bg-zinc-50 px-4 py-4 dark:bg-zinc-950 md:px-6 md:py-6">
        <div className="mx-auto max-w-5xl space-y-4">
          <Skeleton className="h-10 w-36" />
          <Skeleton className="h-16 w-full" />
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
          <Skeleton className="h-72 w-full" />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-full bg-zinc-50 px-4 py-4 dark:bg-zinc-950 md:px-6 md:py-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <header className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Đối soát vận hành
            </p>
            <h1 className="mt-1 text-2xl font-bold text-zinc-950 dark:text-white">
              Báo cáo
            </h1>
          </div>
          <Button
            variant="secondary"
            size="sm"
            icon={RefreshCw}
            onClick={() => window.location.reload()}
            title="Làm mới"
          />
        </header>

        <div className="flex gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800">
          <span className="flex flex-1 items-center justify-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-medium text-zinc-950 shadow-sm dark:bg-zinc-700 dark:text-white">
            <BarChart3 size={16} />
            Tổng quan
          </span>
          <Link
            href="/shifts"
            className="flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            <CalendarClock size={16} />
            Theo ca
          </Link>
        </div>

        <ReportsOverview user={user} />
      </div>
    </div>
  )
}
