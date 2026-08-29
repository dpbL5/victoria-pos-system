import type { PaymentMethod, PricingRuleSnapshot, PromotionDiscountType, SessionPricingGroupDTO } from '@/types'

export type { PaymentMethod } from '@/types'
export type CustomerType = 'WALK_IN' | 'MEMBER'
export type ProductType = 'PRODUCT' | 'SERVICE'
export type UserRole = 'ADMIN' | 'MANAGER' | 'STAFF'
export type ShiftParticipantRole = 'LEAD' | 'STAFF'

export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  current?: Membership | null
  error?: string
  message?: string
  code?: string
  warnings?: string[]
}

export interface Customer {
  id: string
  fullName: string
  phone: string | null
  type: CustomerType
  totalHoursPlayed?: number | string
  totalSpent?: number | string
}

export interface SessionRow {
  id: string
  startTime: string
  endTime?: string | null
  status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED'
  hourlyRate: number | string
  pricingRuleId?: string | null
  pricingRuleSnapshot?: PricingRuleSnapshot | null
  totalHours?: number | string | null
  subtotal?: number | string | null
  discountAmount?: number | string | null
  totalAmount?: number | string | null
  playerCount: number
  /** Tên khách vãng lai lưu trên phiên (không tạo Customer) */
  customerName?: string | null
  /** null = đang chạy, khác null = đang tạm dừng tại thời điểm này */
  pausedAt?: string | null
  /** Tổng số giây đã tạm dừng (đã chốt qua các lần pause/resume) */
  totalPausedSeconds?: number
  promotionRuleId?: string | null
  promotionName?: string | null
  promotionDiscountType?: PromotionDiscountType | null
  promotionDiscountValue?: number | string | null
  /** Null với khách vãng lai không tạo Customer */
  customer: Customer | null
  staff: { id: string; fullName: string }
  membership?: { id: string; startsAt: string; expiresAt: string } | null
  shift?: { id: string; openedAt: string; status: 'OPEN' | 'CLOSED' } | null
  payment?: { paymentMethod: PaymentMethod } | null
  pendingSellTotal?: number
  pricingGroups?: SessionPricingGroupDTO[]
}

export interface Shift {
  id: string
  staff?: { id: string; fullName: string }
  openedAt: string
  closedAt?: string | null
  openingCash: number | string
  closingCash?: number | string | null
  expectedCash?: number | string | null
  cashDifference?: number | string | null
  status: 'OPEN' | 'CLOSED'
  notes?: string | null
  participants?: Array<{
    id: string
    role: ShiftParticipantRole
    joinedAt: string
    leftAt?: string | null
    staff: { id: string; fullName: string }
  }>
  toolCounts?: Array<{
    id: string
    toolId: string
    openCount: number
    closeCount?: number | null
    tool: { id: string; name: string; quantity: number; isRequired: boolean }
  }>
}

export interface Product {
  id: string
  name: string
  sku?: string | null
  type: ProductType
  price: number | string
  stockQuantity: number
  minStockLevel: number
  isActive: boolean
  createdAt?: string
  updatedAt?: string
}

export interface MembershipPlan {
  id: string
  name: string
  durationMonths: number
  price: number | string
  isActive: boolean
}

export interface Membership {
  id: string
  startsAt: string
  expiresAt: string
  status: 'ACTIVE' | 'CANCELLED'
  plan?: MembershipPlan
}

export interface UserSession {
  userId: string
  username: string
  fullName: string
  role: UserRole
}
