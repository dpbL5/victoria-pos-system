import { redirect } from 'next/navigation'
import { requireAuth } from '@/lib/shared/auth'
import { firstAccessibleModuleRoute } from '@/lib/shared/permissions'
import { DashboardClientLayout } from '@/components/layout/dashboard-client-layout'
import { NoRoleScreen } from '@/components/layout/no-role-screen'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  let user: Awaited<ReturnType<typeof requireAuth>>

  try {
    user = await requireAuth()
  } catch {
    redirect('/login')
  }

  // "Chưa phân vai" (hoặc role không có quyền module nào) — hiển thị màn hình
  // chờ phân quyền thay vì chrome rỗng; tránh redirect vòng giữa các trang.
  if (!firstAccessibleModuleRoute(user.role?.permissions, user.role?.key)) {
    return <NoRoleScreen fullName={user.fullName} />
  }

  return <DashboardClientLayout user={user}>{children}</DashboardClientLayout>
}
