import { redirect } from 'next/navigation'
import { requireAuth } from '@/lib/auth'
import { DashboardClientLayout } from '@/components/layout/dashboard-client-layout'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  let user: { userId: string; username: string; fullName: string; role: string }

  try {
    user = await requireAuth()
  } catch {
    redirect('/login')
  }

  return <DashboardClientLayout user={user}>{children}</DashboardClientLayout>
}
