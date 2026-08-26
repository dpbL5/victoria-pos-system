import { redirect } from 'next/navigation'
import { requireAuth } from '@/lib/shared/auth'
import { isAdminOnly } from '@/lib/shared/roles'
import { ToolsScreen } from '@/features/tools/tools-screen'

export default async function ToolsPage() {
  let user
  try {
    user = await requireAuth()
  } catch {
    redirect('/login')
  }

  if (!isAdminOnly(user?.role)) {
    redirect('/sessions')
  }

  return <ToolsScreen />
}
