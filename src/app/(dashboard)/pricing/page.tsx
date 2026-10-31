import { requirePageAccess } from '@/lib/shared/page-access'
import { PricingScreen } from '@/features/pricing/pricing-screen'

export default async function PricingPage() {
  await requirePageAccess('pricing')

  return <PricingScreen />
}
