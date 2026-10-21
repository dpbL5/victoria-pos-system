import { redirect } from 'next/navigation'
import { requireAuth } from '@/lib/shared/auth'
import { isManagerOrAdmin } from '@/lib/shared/roles'
import { StockMovementsScreen } from '@/features/inventory/stock-movements-screen'

export default async function InventoryMovementsPage() {
  let user
  try {
    user = await requireAuth()
  } catch {
    redirect('/login')
  }

  if (!isManagerOrAdmin(user?.role)) {
    redirect('/sessions')
  }

  return <StockMovementsScreen />
}
