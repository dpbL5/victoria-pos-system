import { redirect } from 'next/navigation'
import { requireAuth } from '@/lib/shared/auth'
import { isManagerOrAdmin } from '@/lib/shared/roles'
import { ShiftsScreen } from '@/features/shifts/shifts-screen'

export default async function ShiftsPage() {
  let user
  try {
    user = await requireAuth()
  } catch {
    redirect('/login')
  }

  // STAFF không được vào màn hình Ca làm — chỉ MANAGER/ADMIN
  if (!isManagerOrAdmin(user?.role)) {
    redirect('/sessions')
  }

  return <ShiftsScreen />
}
