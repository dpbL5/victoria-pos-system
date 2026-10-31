import { requirePageAccess } from '@/lib/shared/page-access'
import { StockMovementsScreen } from '@/features/inventory/stock-movements-screen'

export default async function InventoryMovementsPage() {
  await requirePageAccess('products', 'stock')

  return <StockMovementsScreen />
}
