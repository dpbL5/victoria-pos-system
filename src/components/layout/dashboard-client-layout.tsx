'use client'

import { useCallback, useEffect, useState } from 'react'
import { ThemeProvider } from '@/components/layout/theme-provider'
import { Sidebar } from '@/components/layout/sidebar'
import { BottomNav } from '@/components/layout/bottom-nav'
import { Header } from '@/components/layout/header'
import { PageRefreshProvider } from '@/components/layout/page-refresh-context'
import { ToastProvider } from '@/components/ui/toast'

interface User {
  userId: string
  username: string
  fullName: string
  role: string
}

const SIDEBAR_COLLAPSED_KEY = 'qltrungcung_sidebar_collapsed'

export function DashboardClientLayout({ user, children }: { user: User; children: React.ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      try {
        const stored = localStorage.getItem(SIDEBAR_COLLAPSED_KEY)
        if (stored === 'true') setSidebarCollapsed(true)
      } catch {
        // ignore
      }
    }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [])

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next))
      } catch {
        // ignore
      }
      return next
    })
  }, [])

  const sidebarOffset = sidebarCollapsed ? 'md:ml-[4.5rem]' : 'md:ml-60'

  return (
    <ThemeProvider>
      <ToastProvider>
        <div className="flex min-h-screen bg-white dark:bg-zinc-950">
          <Sidebar collapsed={sidebarCollapsed} onToggle={toggleSidebar} userRole={user.role} />

          <div className={`flex min-w-0 flex-1 flex-col pb-16 transition-all duration-200 md:pb-0 ${sidebarOffset}`}>
            <PageRefreshProvider>
              <Header
                userFullName={user.fullName}
                userRole={user.role}
              />
              <main className="flex-1">{children}</main>
            </PageRefreshProvider>
          </div>

          <BottomNav userRole={user.role} />
        </div>
      </ToastProvider>
    </ThemeProvider>
  )
}
