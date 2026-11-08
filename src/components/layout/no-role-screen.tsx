'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { mutate as clearSWRCache } from 'swr'
import { LogOut, ShieldOff } from 'lucide-react'
import { apiJson } from '@/lib/api'
import { PAGE_TITLE_CLASS } from '@/components/ui/page-title'

/** Màn hình cho user "Chưa phân vai" — đăng nhập được nhưng không có quyền nào */
export function NoRoleScreen({ fullName }: { fullName: string }) {
  const router = useRouter()
  const [loggingOut, setLoggingOut] = useState(false)

  const handleLogout = async () => {
    setLoggingOut(true)
    try {
      await apiJson('/api/auth/logout', { method: 'POST' })
      await clearSWRCache(() => true, undefined, { revalidate: false })
      router.replace('/login')
    } catch {
      router.replace('/login')
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white px-4 text-center dark:bg-zinc-950">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-100 dark:bg-zinc-800">
        <ShieldOff className="text-zinc-400 dark:text-zinc-600" size={28} />
      </div>
      <h1 className={PAGE_TITLE_CLASS}>
        Tài khoản chưa được phân vai trò
      </h1>
      <p className="mt-2 max-w-sm text-sm text-zinc-500 dark:text-zinc-400">
        Xin chào {fullName}. Tài khoản của bạn chưa được gán vai trò hoặc vai trò hiện không có
        quyền nào. Vui lòng liên hệ quản trị viên để được phân quyền.
      </p>
      <button
        type="button"
        onClick={handleLogout}
        disabled={loggingOut}
        className="mt-6 inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-60 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        <LogOut size={16} />
        {loggingOut ? 'Đang đăng xuất...' : 'Đăng xuất'}
      </button>
    </div>
  )
}
