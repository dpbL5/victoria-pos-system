import { requirePageAccess } from '@/lib/shared/page-access'
import { CashflowScreen } from '@/features/cashflow/cashflow-screen'

export default async function CashflowPage() {
  await requirePageAccess('cashflows')

  return <CashflowScreen />
}
