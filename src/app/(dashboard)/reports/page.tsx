import { redirect } from 'next/navigation'
import { requireAuth } from '@/lib/shared/auth'
import { isManagerOrAdmin } from '@/lib/shared/roles'
import { ReportsScreen } from '@/features/reports/reports-screen'

export default async function ReportsPage() {
  let user
  try {
    user = await requireAuth()
  } catch {
    redirect('/login')
  }

  if (!isManagerOrAdmin(user?.role)) {
    redirect('/sessions')
  }

  return <ReportsScreen />
}
