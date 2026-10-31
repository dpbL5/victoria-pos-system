import { CustomerDetailScreen } from '@/features/memberships/customer-detail-screen'
import { requirePageAccess } from '@/lib/shared/page-access'
import { toInputDate } from '@/lib/shared/utils'

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePageAccess('customers', 'memberships')

  const { id } = await params
  const today = toInputDate(new Date())
  return <CustomerDetailScreen id={id} today={today} />
}
