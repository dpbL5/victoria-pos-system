import { TransactionDetailScreen } from '@/features/pos/transaction-detail-screen'
import { requirePageAccess } from '@/lib/shared/page-access'

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePageAccess('invoices')

  const { id } = await params
  return <TransactionDetailScreen id={id} />
}
