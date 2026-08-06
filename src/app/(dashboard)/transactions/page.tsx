import { ShiftTransactionsScreen } from '@/features/transactions/shift-transactions-screen'

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ shiftId?: string }>
}) {
  const { shiftId } = await searchParams
  return <ShiftTransactionsScreen initialShiftId={shiftId} />
}
