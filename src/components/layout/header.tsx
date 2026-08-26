"use client";

import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { RefreshCw } from 'lucide-react'
import { usePageRefresh } from './page-refresh-context'

interface HeaderProps {
  userFullName: string
  userRole: string
}

const TITLES: Record<string, string> = {
  '/sessions': 'Ca hôm nay',
  '/shifts': 'Ca làm',
  '/customers': 'Hội viên',
  '/inventory': 'Kho quầy',
  '/reports': 'Báo cáo',
  '/pricing': 'Bảng giá',
  '/promotions': 'Khuyến mại giờ chơi',
  '/tools': 'Dụng cụ quầy',
  '/staff': 'Nhân viên',
  '/settings': 'Thêm',
  '/cashflow': 'Thu chi',
  '/membership-plans': 'Gói hội viên',
}

function getTitle(pathname: string): string {
  for (const [href, title] of Object.entries(TITLES)) {
    if (pathname.startsWith(href)) return title
  }
  return ''
}

export function Header({ userFullName, userRole }: HeaderProps) {
  const pathname = usePathname()
  const { refresh } = usePageRefresh()
  const roleLabel = userRole === 'ADMIN' ? 'Quản trị viên' : userRole === 'MANAGER' ? 'Quản lý' : 'Nhân viên'
  const initial = userFullName.charAt(0).toUpperCase()
  const title = getTitle(pathname)

  return (
    <header className="md:hidden sticky top-0 z-30 flex items-center gap-3 border-b border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-zinc-950/95 backdrop-blur-md px-4 py-2.5">
      <div className="flex items-center gap-2">
        <div className="relative h-7 w-7 shrink-0 overflow-hidden rounded-md bg-white p-0.5 shadow-sm ring-1 ring-zinc-200 dark:ring-zinc-800">
          <Image
            src="/logo.jpg"
            alt="Victoria Archery Club"
            width={28}
            height={28}
            className="h-full w-full object-contain"
          />
        </div>
        {title && (
          <h1 className="text-xl font-bold leading-7 tracking-wide text-zinc-900 dark:text-white">
            {title}
          </h1>
        )}
      </div>

      <div className="flex-1" />

      {refresh && (
        <button
          type="button"
          onClick={() => refresh()}
          title="Làm mới"
          aria-label="Làm mới"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
        >
          <RefreshCw size={18} />
        </button>
      )}

      <div className="hidden sm:flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">
          {initial}
        </div>
        <div className="text-right">
          <p className="text-xs font-medium text-zinc-900 dark:text-white leading-tight">
            {userFullName}
          </p>
          <p className="text-[10px] text-zinc-400 dark:text-zinc-500 leading-tight">
            {roleLabel}
          </p>
        </div>
      </div>
    </header>
  )
}
