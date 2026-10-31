import { requirePageAccess } from '@/lib/shared/page-access'
import { InventoryScreen } from '@/features/inventory/inventory-screen'

export default async function InventoryPage() {
  await requirePageAccess('products', 'stock')

  return <InventoryScreen />
}
