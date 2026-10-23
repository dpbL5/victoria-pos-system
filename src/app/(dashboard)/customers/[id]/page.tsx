import { CustomerDetailScreen } from '@/features/memberships/customer-detail-screen'
import { toInputDate } from '@/lib/shared/utils'

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const today = toInputDate(new Date())
  return <CustomerDetailScreen id={id} today={today} />
}
