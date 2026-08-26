import { redirect } from 'next/navigation'
import { requireAuth } from '@/lib/shared/auth'
import { isManagerOrAdmin } from '@/lib/shared/roles'
import { InventoryScreen } from '@/features/inventory/inventory-screen'

export default async function InventoryPage() {
  let user
  try {
    user = await requireAuth()
  } catch {
    redirect('/login')
  }

  if (!isManagerOrAdmin(user?.role)) {
    redirect('/sessions')
  }

  return <InventoryScreen />
}
