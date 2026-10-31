import { requirePageAccess } from '@/lib/shared/page-access'
import { ShiftsScreen } from '@/features/shifts/shifts-screen'

export default async function ShiftsPage() {
  await requirePageAccess('shifts')

  return <ShiftsScreen />
}
