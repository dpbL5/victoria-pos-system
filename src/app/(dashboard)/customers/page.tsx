import { MemberScreen } from '@/features/memberships/member-screen'
import { requirePageAccess } from '@/lib/shared/page-access'

export default async function CustomersPage() {
  await requirePageAccess('customers', 'memberships')

  return <MemberScreen />
}
