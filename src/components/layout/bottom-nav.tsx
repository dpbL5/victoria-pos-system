'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  BarChart3,
  Clock,
  GraduationCap,
  MoreHorizontal,
  School,
  Timer,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { canAccessTraining, isAdminOnly, isManagerOrAdmin } from '@/lib/shared/roles'

interface NavItem {
  href: string
  label: string
  Icon: LucideIcon
  /** Guard thật của route (đọc ở page.tsx tương ứng); thiếu = mọi role mở được */
  canAccess?: (role: string | undefined) => boolean
}

// Thứ tự trái → phải: Ca hôm nay · Ca làm · Báo cáo · Lịch học · Thêm.
// Tab chỉ hiện với role mà guard của route cho mở — /shifts (MANAGER/ADMIN),
// /reports (ADMIN), /lessons (ADMIN/TEACHER).
const navItems: NavItem[] = [
  { href: '/sessions', label: 'Ca hôm nay', Icon: Timer },
  { href: '/shifts', label: 'Ca làm', Icon: Clock, canAccess: isManagerOrAdmin },
  { href: '/reports', label: 'Báo cáo', Icon: BarChart3, canAccess: isAdminOnly },
  { href: '/lessons', label: 'Lịch học', Icon: GraduationCap, canAccess: canAccessTraining },
  { href: '/settings', label: 'Thêm', Icon: MoreHorizontal },
]

// Giáo viên không trực quầy — giữ nav riêng theo các màn đào tạo họ mở được.
const teacherNavItems: NavItem[] = [
  { href: '/lessons', label: 'Lịch học', Icon: GraduationCap },
  { href: '/classes', label: 'Lớp học', Icon: School },
  { href: '/students', label: 'Học viên', Icon: Users },
  { href: '/settings', label: 'Thêm', Icon: MoreHorizontal },
]

/** Tab hiện với một role — chỉ những route mà guard thật sự cho mở */
export function getVisibleNavItems(userRole?: string): NavItem[] {
  const source = userRole === 'TEACHER' ? teacherNavItems : navItems
  return source.filter((item) => !item.canAccess || item.canAccess(userRole))
}

interface BottomNavProps {
  userRole?: string
}

export function BottomNav({ userRole }: BottomNavProps) {
  const pathname = usePathname()
  const visibleItems = getVisibleNavItems(userRole)

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
