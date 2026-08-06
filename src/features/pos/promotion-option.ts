import type { PromotionSnapshot } from '@/types'
import { money } from './format'

export function formatPromotionOption(promotion: PromotionSnapshot): string {
  if (promotion.discountType === 'PERCENT' || promotion.discountType === 'PERCENT_PLAY_TIME') {
    return `${promotion.name} · Giảm ${promotion.discountValue}%`
  }
  if (promotion.discountType === 'FIXED_PER_HOUR') {
    return `${promotion.name} · Giảm ${money(promotion.discountValue)}/giờ`
  }
  return `${promotion.name} · Giảm ${money(promotion.discountValue)}`
}
