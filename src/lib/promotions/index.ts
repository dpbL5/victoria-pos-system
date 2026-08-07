// ── Promotions module — PromotionRule (read-side) ─────
export {
  normalizePromotionDays,
  derivePromotionDayType,
  resolvePromotionDays,
  toPromotionSnapshot,
  promotionRuleWhere,
  hasSharedDay,
  type PromotionOverlapInfo,
} from './helpers'
export type {
  PromotionRepository,
  FindOverlappingPromotionsInput,
} from './ports'
export * from './validations'
