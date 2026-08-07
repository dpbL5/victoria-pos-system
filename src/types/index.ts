// ── Shared TypeScript types ─────────────────────────────

// Re-export Prisma enums as convenience types
export type UserRole = "ADMIN" | "STAFF"
export type CustomerType = "WALK_IN" | "MEMBER"
export type SessionStatus = "ACTIVE" | "COMPLETED" | "CANCELLED"
export type DayType = "WEEKDAY" | "WEEKEND"
export type PromotionDiscountType = "FIXED_AMOUNT" | "PERCENT" | "FIXED_PER_HOUR" | "PERCENT_PLAY_TIME"
export type PaymentMethod = "CASH" | "TRANSFER" | "CARD" | "MEMBER"
/** Phương thức được chấp nhận khi thu tiền lúc checkout phiên chơi. */
export type CheckoutPaymentMethod = Exclude<PaymentMethod, "MEMBER">
export type MembershipStatus = "ACTIVE" | "CANCELLED"
export type InvoiceStatus = "DRAFT" | "PAID" | "CANCELLED"
export type InvoiceItemType = "PLAY_TIME" | "MEMBERSHIP_FEE" | "PRODUCT" | "SERVICE" | "DISCOUNT" | "SURCHARGE"
export type ProductType = "PRODUCT" | "SERVICE"
export type StockMovementType = "RESTOCK" | "SALE" | "ADJUSTMENT" | "VOID"
export type ShiftStatus = "OPEN" | "CLOSED"
export type ShiftParticipantRole = "LEAD" | "STAFF"

export interface PromotionRule {
  id: string
  name: string
  discountType: PromotionDiscountType
  discountValue: number | string
  daysOfWeek: number[]
  hourFrom: number
  hourTo: number | null
  dayType: DayType
  effectiveFrom: string
  effectiveTo: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface PromotionSnapshot {
  ruleId: string
  name: string
  discountType: PromotionDiscountType
  discountValue: number
}

export interface PlayTimeQuote {
  sessionId: string
  totalHours: number
  hourlyRate: number
  subtotal: number
  discountAmount: number
  grandTotal: number
  isMemberSession: boolean
  promotion: PromotionSnapshot | null
  pendingSellTotal: number
  pendingSellItems: PendingSellItem[]
  playerCount?: number
  pricingGroupId?: string
  pricingGroups?: SessionPricingGroupDTO[]
  parkingFeeUnitPrice?: number
}

export interface PendingSellItem {
  productId: string
  productName: string
  type: 'PRODUCT' | 'SERVICE'
  quantity: number
  unitPrice: number
  subtotal: number
}

export interface PricingTier {
  id: string
  ruleId: string
  minHours: number
  ratePerHour: number | string
}

export interface SessionPricingGroupDTO {
  id: string
  sessionId: string
  label: string
  playerCount: number
  remainingCount: number
  hourlyRate: number
  pricingRuleId: string | null
  pricingSnapshot: PricingRuleSnapshot | null
}

export interface PricingRuleTierSnapshot {
  minHours: number
  ratePerHour: number
}

export interface PricingRuleSnapshot {
  ruleId: string
  name: string
  ratePerHour: number
  tiers: PricingRuleTierSnapshot[]
}

// ── Session payload (JWT) ──────────────────────────────
export interface SessionPayload {
  userId: string
  username: string
  fullName: string
  role: UserRole
}

// ── API response wrappers ──────────────────────────────
export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  current?: unknown
  error?: string
  message?: string
  warnings?: string[]
}

export interface PaginatedResponse<T> {
  success: boolean
  data: T[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

// ── Report types ───────────────────────────────────────
export interface DashboardStats {
  todayRevenue: number
  todaySessions: number
  activeSessions: number
  totalCustomersToday: number
}

export interface RevenueReport {
  period: string
  revenue: number
  sessionCount: number
  avgRevenuePerSession: number
}

// ── Shift report types ──

export interface TransactionItem {
  id: string
  type: 'payment' | 'membership'
  amount: number
  paymentMethod: string | null
  paidAt: string
  customerName: string
  customerType: string | null
  invoiceId: string | null
  invoiceNo: string | null
  invoiceStatus: string | null
  staffName: string
  planName: string | null
}

export interface ShiftRevenueSummary {
  id: string
  openedAt: string
  closedAt: string | null
  openingCash: number
  closingCash: number | null
  expectedCash: number | null
  cashDifference: number | null
  status: ShiftStatus
  notes: string | null
  staff: { id: string; fullName: string }
  totalRevenue: number
  cashRevenue: number
  transferRevenue: number
  cardRevenue: number
  memberRevenue: number
  paymentCount: number
  membershipCount: number
  sessionCount: number
  toolStats?: {
    total: number
    matched: number
    mismatched: number
  }
  toolCounts?: Array<{
    id: string
    toolId: string
    tool: { id: string; name: string; quantity: number; isRequired: boolean }
    openCount: number
    closeCount: number | null
  }>
}

export interface ShiftReportDetail extends ShiftRevenueSummary {
  participants: Array<{
    id: string
    role: ShiftParticipantRole
    joinedAt: string
    leftAt: string | null
    staff: { id: string; fullName: string }
  }>
  byPaymentMethod: Record<PaymentMethod, { total: number; count: number }>
  byItemType: Record<InvoiceItemType, number>
  transactions: TransactionItem[]
  toolCounts?: Array<{
    id: string
    toolId: string
    tool: { id: string; name: string; quantity: number; isRequired: boolean }
    openCount: number
    closeCount: number | null
  }>
}
