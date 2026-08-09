// ── Sessions module — Session + PricingRule + PromotionRule (write-side) ─────
export { checkIn, mapCheckInError } from './use-cases/check-in'
export { checkOut, mapCheckoutError } from './use-cases/check-out'
export { sellItems, mapSellItemsError } from './use-cases/sell-items'
export { updateSession, mapUpdateSessionError } from './use-cases/update-session'
export { createProduct, mapCreateProductError, applyStockMovement, mapApplyStockMovementError } from './use-cases/product-crud'
export {
  calculateSessionPrice,
  calculateSessionPriceFromLoaded,
  type PricingResult,
  type PricingEngineDeps,
} from './pricing-engine'
export type {
  CheckInInput,
  CheckInResult,
} from './use-cases/check-in'
export type {
  CheckoutInput,
  CheckoutResult,
} from './use-cases/check-out'
export type {
  SellItemsInput,
  SellItemsResult,
} from './use-cases/sell-items'
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
  ProductRecord,
  ProductAdminRow,
  ProductAdminDetail,
} from './ports'
export * from './session-validations'
export * from './product-validations'
