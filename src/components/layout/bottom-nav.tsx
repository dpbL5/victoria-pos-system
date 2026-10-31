'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  BarChart3,
  CalendarClock,
  GraduationCap,
  MoreHorizontal,
  Package,
  School,
  Timer,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { moduleAccessible } from '@/lib/shared/permissions'

interface NavItem {
  href: string
  label: string
  Icon: LucideIcon
  /** Nhóm quyền điều khiển việc hiện tab — ẩn hoàn toàn khi không có quyền nào trong nhóm */
  groupKey?: string
  alwaysVisible?: boolean
}

// Một danh sách duy nhất khai báo theo permission — thứ tự cố định theo AGENTS.md
// (Ca hôm nay · Lịch đặt · Báo cáo · Kho · Thêm). Lọc theo quyền tự sinh đúng
// bộ nav cho mọi role, kể cả role tuỳ chỉnh.
const navItems: NavItem[] = [
  { href: '/sessions', label: 'Ca hôm nay', Icon: Timer, groupKey: 'sessions' },
  { href: '/bookings', label: 'Lịch đặt', Icon: CalendarClock, groupKey: 'bookings' },
  { href: '/reports', label: 'Báo cáo', Icon: BarChart3, groupKey: 'reports' },
  { href: '/inventory', label: 'Kho', Icon: Package, groupKey: 'stock' },
  { href: '/lessons', label: 'Lịch học', Icon: GraduationCap, groupKey: 'lessons' },
  { href: '/classes', label: 'Lớp học', Icon: School, groupKey: 'classes' },
  { href: '/students', label: 'Học viên', Icon: Users, groupKey: 'students' },
  { href: '/settings', label: 'Thêm', Icon: MoreHorizontal, alwaysVisible: true },
]

/** Tab hiện với một bộ quyền — nhóm không có quyền nào bị loại hoàn toàn */
export function getVisibleNavItems(
  perms?: readonly string[] | null,
  roleKey?: string | null,
): NavItem[] {
  return navItems.filter(
    (item) =>
      item.alwaysVisible ||
      (item.groupKey ? moduleAccessible(perms, item.groupKey, roleKey) : false),
  )
}

interface BottomNavProps {
  permissions?: string[] | null
  roleKey?: string | null
}

export function BottomNav({ permissions, roleKey }: BottomNavProps) {
  const pathname = usePathname()
  const visibleItems = getVisibleNavItems(permissions, roleKey)

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
                ? 'text-info nav-active'
                  : 'text-zinc-400 dark:text-zinc-500'
                }`}
              >
              <div
                className={`flex items-center justify-center rounded-lg p-1 transition-colors ${
                  active ? 'bg-info-bg' : ''
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
