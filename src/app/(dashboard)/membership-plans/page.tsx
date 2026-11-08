import { requirePageAccess } from '@/lib/shared/page-access'
import { MembershipPlansScreen } from '@/features/membership-plans/membership-plans-screen'

export default async function MembershipPlansPage() {
  await requirePageAccess('memberships')

  return <MembershipPlansScreen />
}
