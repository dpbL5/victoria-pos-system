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

export function BottomNav() {
  const pathname = usePathname()
  const visibleItems = navItems
  const gridCols = 'grid-cols-5'

  const isActive = (href: string) =>
    href === '/sessions'
      ? pathname === '/sessions' || pathname === '/'
      : pathname.startsWith(href)

  return (
    <nav className="safe-area-bottom fixed inset-x-0 bottom-0 z-50 border-t border-zinc-200 bg-white/95 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/95 md:hidden">
      <div className={`grid h-16 ${gridCols}`}>
        {visibleItems.map((item) => {
          const active = isActive(item.href)
          const { Icon } = item
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex min-w-0 flex-col items-center justify-center gap-0.5 py-1 transition-colors ${
                active
                  ? 'text-blue-600 dark:text-blue-400'
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
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
