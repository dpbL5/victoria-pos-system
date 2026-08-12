import { CustomerDetailScreen } from '@/features/memberships/customer-detail-screen'

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <CustomerDetailScreen id={id} />
}
