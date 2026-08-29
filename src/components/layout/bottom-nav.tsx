'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  BarChart3,
  MoreHorizontal,
  Package,
  ShieldCheck,
  Timer,
  type LucideIcon,
} from 'lucide-react'

interface NavItem {
  href: string
  label: string
  Icon: LucideIcon
}

const navItems: NavItem[] = [
  { href: '/sessions', label: 'Ca', Icon: Timer },
  { href: '/customers', label: 'Hội viên', Icon: ShieldCheck },
  { href: '/inventory', label: 'Kho', Icon: Package },
  { href: '/reports', label: 'Báo cáo', Icon: BarChart3 },
  { href: '/settings', label: 'Thêm', Icon: MoreHorizontal },
]

interface BottomNavProps {
  userRole?: string
}

export function BottomNav({ userRole }: BottomNavProps) {
  const pathname = usePathname()
  // STAFF: Ca, Hội viên, Thêm. MANAGER: thêm Kho. ADMIN: đủ 5 tab.
  const visibleItems = navItems.filter((item) => {
    if (userRole === 'STAFF') {
      return item.href === '/sessions' || item.href === '/customers' || item.href === '/settings'
    }
    if (userRole === 'MANAGER') {
      return item.href !== '/reports'
    }
    return true
  })

  const isActive = (href: string) =>
    href === '/sessions'
      ? pathname === '/sessions' || pathname === '/'
      : pathname.startsWith(href)

  return (
    <nav className="safe-area-bottom fixed inset-x-0 bottom-0 z-50 border-t border-zinc-200 bg-white/95 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/95 md:hidden">
      <div
        className="grid h-16"
        style={{ gridTemplateColumns: `repeat(${visibleItems.length}, minmax(0, 1fr))` }}
      >
        {visibleItems.map((item) => {
          const active = isActive(item.href)
          const { Icon } = item
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={`motion-press relative flex min-w-0 flex-col items-center justify-center gap-0.5 py-1 ${
                active
                  ? 'text-blue-600 dark:text-blue-400 nav-active'
                  : 'text-zinc-400 dark:text-zinc-500'
              }`}
            >
              <div
                className={`flex items-center justify-center rounded-lg p-1 transition-colors ${
                  active ? 'bg-blue-50 dark:bg-blue-500/15' : ''
                }`}
              >
                <Icon size={20} />
              </div>
              <span className="max-w-16 truncate text-[10px] font-medium">
                {item.label}
              </span>
              <span className="nav-dot" aria-hidden="true" />
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
