import { redirect } from 'next/navigation'
import { requireAuth } from '@/lib/shared/auth'
import { canAccessTraining } from '@/lib/shared/roles'
import { LessonsScreen } from '@/features/students/lessons-screen'

export default async function LessonsPage() {
  let user
  try {
    user = await requireAuth()
  } catch {
    redirect('/login')
  }

  if (!canAccessTraining(user?.role)) {
    redirect('/sessions')
  }

  return <LessonsScreen />
}
