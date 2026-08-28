'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import {
  ArrowRightLeft,
  Banknote,
  BarChart3,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  Package,
  Settings,
  ShieldCheck,
  Tag,
  Timer,
  UserCog,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import { useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { isAdminOnly } from '@/lib/shared/roles'

interface MenuItem {
  href: string
  label: string
  Icon: LucideIcon
  adminOnly?: boolean
  staffHidden?: boolean
}

export const staffMenuItems: MenuItem[] = [
  { href: '/sessions', label: 'Ca hôm nay', Icon: Timer },
  { href: '/shifts', label: 'Ca làm', Icon: CalendarClock, staffHidden: true },
  { href: '/customers', label: 'Hội viên', Icon: ShieldCheck },
  { href: '/inventory', label: 'Kho', Icon: Package, staffHidden: true },
  { href: '/reports', label: 'Báo cáo', Icon: BarChart3, adminOnly: true },
  { href: '/pricing', label: 'Bảng giá', Icon: Banknote, adminOnly: true },
  { href: '/promotions', label: 'Khuyến mại', Icon: Tag, adminOnly: true },
  { href: '/tools', label: 'Dụng cụ', Icon: Wrench, adminOnly: true },
  { href: '/students', label: 'Học viên', Icon: GraduationCap, adminOnly: true },
  { href: '/staff', label: 'Nhân viên', Icon: UserCog, adminOnly: true },
  { href: '/cashflow', label: 'Thu chi', Icon: ArrowRightLeft, adminOnly: true },
  { href: '/settings', label: 'Cài đặt', Icon: Settings },
]

export function getVisibleStaffMenuItems(userRole?: string): MenuItem[] {
  return staffMenuItems.filter((item) => {
    if (item.adminOnly && !isAdminOnly(userRole)) return false
    if (item.staffHidden && userRole === 'STAFF') return false
    return true
  })
}

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
  userRole?: string
}

export function Sidebar({ collapsed, onToggle, userRole }: SidebarProps) {
  const pathname = usePathname()
  const menuItems = getVisibleStaffMenuItems(userRole)

  const isActive = useCallback(
    (href: string) =>
      href === '/sessions'
        ? pathname === '/sessions' || pathname === '/'
        : pathname.startsWith(href),
    [pathname]
  )

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-zinc-200 bg-white transition-all duration-200 dark:border-zinc-800 dark:bg-zinc-950 md:flex ${
        collapsed ? 'w-[4.5rem]' : 'w-60'
      }`}
    >
      <div
        className={`flex items-center border-b border-zinc-200 px-4 py-4 dark:border-zinc-800 ${
          collapsed ? 'justify-center' : 'gap-3'
        }`}
      >
        <div
          className={`relative shrink-0 overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-zinc-200 dark:ring-zinc-800 ${
            collapsed ? 'h-9 w-9' : 'h-10 w-10'
          }`}
        >
          <Image
            src="/logo.jpg"
            alt="Victoria Archery Club"
            width={40}
            height={40}
            className="h-full w-full object-contain"
          />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <h1 className="truncate text-sm font-bold leading-tight tracking-wide text-zinc-900 dark:text-white">
              VICTORIA
            </h1>
            <p className="truncate text-[10px] font-medium uppercase tracking-[0.2em] text-gold-dark dark:text-gold">
              Archery Club
            </p>
          </div>
        )}
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-3">
        {menuItems.map((item) => {
          const active = isActive(item.href)
          const { Icon } = item
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={`motion-press flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${
                collapsed ? 'justify-center px-2' : ''
              } ${
                active
                  ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400'
                  : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-200'
              }`}
              title={collapsed ? item.label : undefined}
            >
              <Icon size={20} className="shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          )
        })}
      </nav>

      <div className="border-t border-zinc-200 px-3 py-3 dark:border-zinc-800">
        <Button variant="ghost" size="sm" icon={collapsed ? ChevronRight : ChevronLeft} onClick={onToggle} title={collapsed ? 'Mở rộng' : 'Thu gọn'} />
      </div>
    </aside>
  )
}
