import { redirect } from 'next/navigation'
import { requireAuth } from '@/lib/shared/auth'
import { isAdminOnly } from '@/lib/shared/roles'
import { ClassDetailScreen } from '@/features/classes/class-detail-screen'

export default async function ClassDetailPage({ params }: { params: Promise<{ id: string }> }) {
  let user
  try {
    user = await requireAuth()
  } catch {
    redirect('/login')
  }

  if (!isAdminOnly(user?.role)) {
    redirect('/sessions')
  }

  const { id } = await params
  return <ClassDetailScreen id={id} />
}
