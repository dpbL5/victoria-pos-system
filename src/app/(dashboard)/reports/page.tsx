import { requirePageAccess } from '@/lib/shared/page-access'
import { ReportsScreen } from '@/features/reports/reports-screen'

export default async function ReportsPage() {
  await requirePageAccess('reports')

  return <ReportsScreen />
}
