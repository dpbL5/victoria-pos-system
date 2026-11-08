import { requirePageAccess } from '@/lib/shared/page-access'
import { PromotionScreen } from '@/features/promotions/promotion-screen'

export default async function PromotionsPage() {
  await requirePageAccess('promotions')

  return <PromotionScreen />
}
