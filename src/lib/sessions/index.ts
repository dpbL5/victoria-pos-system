// ── Sessions module — Session + PricingRule + PromotionRule (write-side) ─────
export { checkIn, mapCheckInError } from './use-cases/check-in'
export { checkOut, mapCheckoutError } from './use-cases/check-out'
export { sellItems, mapSellItemsError } from './use-cases/sell-items'
export { updateSession, mapUpdateSessionError } from './use-cases/update-session'
export { pauseSession, resumeSession, mapPauseSessionError, mapResumeSessionError } from './use-cases/pause-session'
export { createProduct, mapCreateProductError, applyStockMovement, mapApplyStockMovementError } from './use-cases/product-crud'
export {
  calculateSessionPrice,
  calculateSessionPriceFromLoaded,
  type PricingResult,
  type PricingEngineDeps,
  type PendingGroupPricing,
} from './pricing-engine'
export type {
  CheckInInput,
  CheckInResult,
} from './use-cases/check-in'
export type {
  CheckoutInput,
  CheckoutResult,
  CheckoutPricingGroupInput,
  PendingAssignment,
} from './use-cases/check-out'
export type {
  SellItemsInput,
  SellItemsResult,
} from './use-cases/sell-items'
export type {
  PauseSessionInput,
  PauseSessionResult,
  ResumeSessionInput,
  ResumeSessionResult,
} from './use-cases/pause-session'
export type {
  UpdateSessionInput,
  UpdateSessionResult,
} from './use-cases/update-session'
export type {
  CreateProductInput,
  CreateProductResult,
  ApplyStockMovementInput,
  ApplyStockMovementResult,
} from './use-cases/product-crud'
export type {
  SessionRepository,
  ProductRepository,
  SessionWithDetails,
  SessionWithCustomer,
  SessionRefs,
  SessionListRow,
  SessionPreviewRow,
  SessionListFilter,
  CreateSessionData,
  CreatePricingGroupData,
  UpdatePricingGroupData,
  ProductRecord,
  ProductAdminRow,
  ProductAdminDetail,
} from './ports'
export * from './session-validations'
export * from './product-validations'
