import { redirect } from 'next/navigation'
import { requireAuth } from '@/lib/shared/auth'
import { isAdminOnly } from '@/lib/shared/roles'
import { ClassesScreen } from '@/features/classes/classes-screen'

export default async function ClassesPage() {
  let user
  try {
    user = await requireAuth()
  } catch {
    redirect('/login')
  }

  if (!isAdminOnly(user?.role)) {
    redirect('/sessions')
  }

  return <ClassesScreen />
}
