import { redirect } from 'next/navigation'
import { requireAuth } from '@/lib/shared/auth'
import { isAdminOnly } from '@/lib/shared/roles'
import { StudentsScreen } from '@/features/students/students-screen'

export default async function StudentsPage() {
  let user
  try {
    user = await requireAuth()
  } catch {
    redirect('/login')
  }

  if (!isAdminOnly(user?.role)) {
    redirect('/sessions')
  }

  return <StudentsScreen />
}
