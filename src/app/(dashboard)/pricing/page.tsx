import { redirect } from 'next/navigation'
import { requireAuth } from '@/lib/shared/auth'
import { isAdminOnly } from '@/lib/shared/roles'
import { PricingScreen } from '@/features/pricing/pricing-screen'

export default async function PricingPage() {
  let user
  try {
    user = await requireAuth()
  } catch {
    redirect('/login')
  }

  if (!isAdminOnly(user?.role)) {
    redirect('/sessions')
  }

  return <PricingScreen />
}
