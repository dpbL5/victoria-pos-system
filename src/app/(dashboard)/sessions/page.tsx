import { TodayShiftScreen } from '@/features/pos/today-shift-screen'
import { requirePageAccess } from '@/lib/shared/page-access'

export default async function SessionsPage() {
  await requirePageAccess('sessions')

  return <TodayShiftScreen />
}
