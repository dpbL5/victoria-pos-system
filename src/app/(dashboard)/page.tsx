import { redirect } from 'next/navigation'
import { requireAuth } from '@/lib/shared/auth'
import { firstAccessibleModuleRoute } from '@/lib/shared/permissions'

export default async function DashboardPage() {
  const user = await requireAuth()
  const route = firstAccessibleModuleRoute(user.role?.permissions, user.role?.key)

  // Không có module nào → layout (dashboard) đã render màn "Chưa phân vai".
  // Trả null thay vì redirect '/sessions' để không tạo vòng lặp
  // /sessions → '/' → /sessions khi mọi page guard đều fail.
  if (!route) return null

  redirect(route)
}
