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
export {
  createPromotionRule,
  mapCreatePromotionRuleError,
  updatePromotionRule,
  mapUpdatePromotionRuleError,
  deletePromotionRule,
  mapDeletePromotionRuleError,
} from './use-cases/promotion-rule-crud'
export type {
  CreatePromotionRuleInput,
  CreatePromotionRuleResult,
  UpdatePromotionRuleInput,
  UpdatePromotionRuleResult,
  DeletePromotionRuleInput,
  DeletePromotionRuleResult,
} from './use-cases/promotion-rule-crud'
export type {
  PromotionRepository,
  PromotionRuleRow,
  FindOverlappingPromotionsInput,
} from './ports'
export * from './validations'
