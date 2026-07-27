import type { PricingRuleSnapshot, PromotionDiscountType, SessionPricingGroupDTO } from '@/types'

export type PaymentMethod = 'CASH' | 'TRANSFER' | 'CARD'
export type CustomerType = 'WALK_IN' | 'MEMBER'
export type ProductType = 'PRODUCT' | 'SERVICE'
export type UserRole = 'ADMIN' | 'STAFF'
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
  promotionRuleId?: string | null
  promotionName?: string | null
  promotionDiscountType?: PromotionDiscountType | null
  promotionDiscountValue?: number | string | null
  customer: Customer
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
}

export interface Product {
  id: string
  name: string
  sku?: string | null
  type: ProductType
  price: number | string
  costPrice?: number | string | null
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
