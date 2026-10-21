// ── Sessions module — Session + PricingRule + PromotionRule (write-side) ─────
export { checkIn, mapCheckInError } from './use-cases/check-in'
export { checkInBooking } from './use-cases/check-in-booking'
export { checkOut, mapCheckoutError } from './use-cases/check-out'
export { sellItems, mapSellItemsError } from './use-cases/sell-items'
export { removeSellItems, mapRemoveSellItemsError } from './use-cases/sell-items'
export { syncSessionSellItems, mapSyncSessionSellItemsError } from './use-cases/sell-items'
export { updateSession, mapUpdateSessionError } from './use-cases/update-session'
export { pauseSession, resumeSession, mapPauseSessionError, mapResumeSessionError } from './use-cases/pause-session'
export { pausePlayer, resumePlayer, mapPausePlayerError, mapResumePlayerError } from './use-cases/pause-session'
export { renamePlayer, mapRenamePlayerError } from './use-cases/rename-player'
export { createProduct, mapCreateProductError, applyStockMovement, mapApplyStockMovementError, deleteProduct, mapDeleteProductError } from './use-cases/product-crud'
export {
  calculatePlayerPrice,
  type PlayerPricingParams,
  type PlayerPricingResult,
} from './pricing-engine'
export { quoteCheckout } from './checkout-quote'
export type {
  CheckoutQuoteDeps,
  CheckoutQuoteResult,
  CheckoutQuotePersistence,
} from './checkout-quote'
export {
  calculateReceipt,
  pricePlayers,
  type CheckoutSelection,
  type CheckoutQuoteOptions,
  type PricedPlayerRow,
  type PricedPlayersResult,
  type QuoteSession,
  type QuoteGroup,
  type QuotePlayer,
  type Receipt,
  type ReceiptInput,
} from './checkout-quote-core'
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
  RemoveSellItemsInput,
  RemoveSellItemsResult,
} from './use-cases/sell-items'
export type {
  SyncSessionSellItemsInput,
  SyncSessionSellItemsResult,
} from './use-cases/sell-items'
export type {
  PauseSessionInput,
  PauseSessionResult,
  ResumeSessionInput,
  ResumeSessionResult,
  PausePlayerInput,
  PausePlayerResult,
  ResumePlayerInput,
  ResumePlayerResult,
} from './use-cases/pause-session'
export type {
  RenamePlayerInput,
  RenamePlayerResult,
} from './use-cases/rename-player'
export type {
  UpdateSessionInput,
  UpdateSessionResult,
} from './use-cases/update-session'
export type {
  CreateProductInput,
  CreateProductResult,
  ApplyStockMovementInput,
  ApplyStockMovementResult,
  DeleteProductInput,
  DeleteProductResult,
} from './use-cases/product-crud'
export type {
  SessionRepository,
  ProductRepository,
  SessionWithDetails,
  SessionWithPlayers,
  SessionWithCustomer,
  SessionRefs,
  SessionListRow,
  SessionListFilter,
  SessionSellItemRecord,
  CreateSessionData,
  CreatePricingGroupData,
  UpdatePricingGroupData,
  ProductRecord,
  ProductAdminRow,
  ProductAdminDetail,
} from './ports'
export { playerPausedSeconds, groupPausedSeconds, sessionPauseSeconds } from './ports'
export * from './session-validations'
export * from './product-validations'
