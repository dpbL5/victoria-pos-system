import { ShiftTransactionsScreen } from '@/features/transactions/shift-transactions-screen'
import { requirePageAccess } from '@/lib/shared/page-access'

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ shiftId?: string }>
}) {
  await requirePageAccess('shifts', 'invoices')

  const { shiftId } = await searchParams
  return <ShiftTransactionsScreen initialShiftId={shiftId} />
}
