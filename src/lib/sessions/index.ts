// ── Sessions module — Session + PricingRule + PromotionRule (write-side) ─────
export { checkIn, mapCheckInError } from './use-cases/check-in'
export { checkOut, mapCheckoutError } from './use-cases/check-out'
export { sellItems, mapSellItemsError } from './use-cases/sell-items'
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
  SessionRepository,
  ProductRepository,
  SessionWithDetails,
  SessionWithCustomer,
  SessionRefs,
  CreateSessionData,
  CreatePricingGroupData,
  ProductRecord,
} from './ports'
