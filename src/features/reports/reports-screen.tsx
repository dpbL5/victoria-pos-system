'use client'

import { useCallback, useEffect, useState } from 'react'
import { BarChart3, Package } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { apiJson } from '@/lib/api'
import type { UserSession } from '@/features/pos/types'
import { usePageRefresh } from '@/components/layout/page-refresh-context'
import { ReportsOverview, type ReportsOverviewHandle } from './reports-overview'
import { ReportsInventory } from './reports-inventory'

type ActiveTab = 'overview' | 'inventory'

export function ReportsScreen() {
  const [user, setUser] = useState<UserSession | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview')
  const [overviewHandle, setOverviewHandle] = useState<ReportsOverviewHandle | null>(null)
  const { registerRefresh } = usePageRefresh()

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

  const refresh = useCallback(() => {
    overviewHandle?.refresh()
  }, [overviewHandle])

  useEffect(() => {
    const unregister = registerRefresh(refresh)
    return unregister
  }, [registerRefresh, refresh])

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
        <header className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-zinc-950 dark:text-white md:text-2xl">
              Báo cáo
            </h1>
          </div>
        </header>

        <div className="flex gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'overview'}
            onClick={() => setActiveTab('overview')}
            className={`flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'overview'
                ? 'bg-white text-zinc-950 shadow-sm dark:bg-zinc-700 dark:text-white'
                : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
            }`}
          >
            <BarChart3 size={16} />
            Tổng quan
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'inventory'}
            onClick={() => setActiveTab('inventory')}
            className={`flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'inventory'
                ? 'bg-white text-zinc-950 shadow-sm dark:bg-zinc-700 dark:text-white'
                : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
            }`}
          >
            <Package size={16} />
            Kho
          </button>
        </div>

        {activeTab === 'overview' ? (
          <ReportsOverview user={user} ref={setOverviewHandle} />
        ) : (
          <ReportsInventory />
        )}
      </div>
    </div>
  )
}
