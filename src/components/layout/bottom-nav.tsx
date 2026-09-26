'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  BarChart3,
  CalendarClock,
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

// /customers (Hội viên) được đưa lên đầu để STAFF thấy [Hội viên, Ca, Thêm].
// MANAGER/ADMIN luôn loại trừ /customers nên thứ tự này chỉ ảnh hưởng STAFF.
const navItems: NavItem[] = [
  { href: '/customers', label: 'Hội viên', Icon: ShieldCheck },
  { href: '/sessions', label: 'Ca', Icon: Timer },
  { href: '/shifts', label: 'Ca làm', Icon: CalendarClock },
  { href: '/inventory', label: 'Kho', Icon: Package },
  { href: '/reports', label: 'Báo cáo', Icon: BarChart3 },
  { href: '/settings', label: 'Thêm', Icon: MoreHorizontal },
]

interface BottomNavProps {
  userRole?: string
}

export function BottomNav({ userRole }: BottomNavProps) {
  const pathname = usePathname()
  // STAFF: Hội viên, Ca, Thêm (Hội viên sang trái). MANAGER/ADMIN: Ca, Ca làm (/shifts), thay thế Hội viên bằng /shifts.
  const visibleItems = navItems.filter((item) => {
    if (userRole === 'STAFF') {
      return item.href === '/sessions' || item.href === '/customers' || item.href === '/settings'
    }
    if (userRole === 'MANAGER') {
      return item.href !== '/reports' && item.href !== '/customers'
    }
    return item.href !== '/customers'
  })

  const isActive = (href: string) =>
    href === '/sessions'
      ? pathname === '/sessions' || pathname === '/'
      : pathname.startsWith(href)

  return (
    <nav aria-label="Điều hướng chính" className="safe-area-bottom pointer-events-none fixed inset-x-0 bottom-0 z-50 px-3 md:hidden">
      <div
        className="pointer-events-auto mx-auto grid h-16 max-w-md grid-cols-1 overflow-hidden rounded-[1.75rem] border border-zinc-200/80 bg-white/90 p-1.5 shadow-[0_8px_30px_rgb(15_23_42/0.14)] backdrop-blur-xl dark:border-zinc-700/80 dark:bg-zinc-900/90 dark:shadow-[0_8px_30px_rgb(0_0_0/0.35)]"
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
