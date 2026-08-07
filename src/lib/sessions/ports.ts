// ── Ports — repository interfaces cho domain sessions ─────
import type { Prisma } from '@/generated/prisma/client'
import type { PricingRuleSnapshot } from '@/types'

export type SessionWithDetails = Prisma.SessionGetPayload<{
  include: {
    customer: true
    membership: true
    pricingGroups: { orderBy: { createdAt: 'asc' } }
  }
}>

export type SessionWithCustomer = Prisma.SessionGetPayload<{
  include: { customer: true }
}>

export type SessionRefs = Prisma.SessionGetPayload<{
  include: {
    customer: { select: { id: true; fullName: true; type: true } }
    membership: { select: { id: true; startsAt: true; expiresAt: true } }
    shift: { select: { id: true; openedAt: true; status: true } }
  }
}>

export interface CreateSessionData {
  customerId: string
  staffId: string
  shiftId: string
  membershipId?: string
  startTime: Date
  hourlyRate: number
  pricingRuleId?: string
  pricingRuleSnapshot?: PricingRuleSnapshot | null
  playerCount: number
}

export interface CreatePricingGroupData {
  sessionId: string
  label: string
  playerCount: number
  remainingCount: number
  hourlyRate: number
  /** null cho session hội viên (không gắn bảng giá) */
  pricingRuleId?: string
  /** null cho session hội viên (không tính tiền giờ) */
  pricingSnapshot: PricingRuleSnapshot | null
}

export interface SessionRepository {
  /** Session + customer + membership + pricingGroups (orderBy createdAt asc) — cho checkout */
  findByIdForCheckout(id: string): Promise<SessionWithDetails | null>
  /** Session + customer — cho sellItems */
  findByIdWithCustomer(id: string): Promise<SessionWithCustomer | null>
  /** Phiên ACTIVE hiện có của khách (chặn check-in trùng) */
  findActiveByCustomer(customerId: string): Promise<{ id: string } | null>
  /** Tạo session kèm customer/membership/shift refs */
  createWithRefs(data: CreateSessionData): Promise<SessionRefs>
  createPricingGroup(data: CreatePricingGroupData): Promise<void>
  /** Unchecked update — cho phép set trực tiếp shiftId, playerCount, promotion fields... */
  update(id: string, data: Prisma.SessionUncheckedUpdateInput): Promise<void>
  /** Giảm remainingCount của group — trả về remainingCount mới */
  decrementGroupRemaining(groupId: string, count: number): Promise<{ remainingCount: number }>
  /** Tổng remainingCount của tất cả groups trong session */
  sumRemainingPlayers(sessionId: string): Promise<number>
}

export interface ProductRecord {
  id: string
  name: string
  type: 'PRODUCT' | 'SERVICE'
  price: number
  costPrice: number | null
  stockQuantity: number
  isActive: boolean
}

export interface ProductRepository {
  /** Sản phẩm theo danh sách id (isActive: true) — pre-tx check */
  findManyByIds(ids: string[]): Promise<ProductRecord[]>
  /** Re-fetch sản phẩm trong transaction (TOCTOU guard) */
  findByIdForSale(id: string): Promise<ProductRecord | null>
  /** Trừ kho có điều kiện stock >= quantity — trả { count } = 0 nếu thiếu */
  decrementStockIfAvailable(id: string, quantity: number): Promise<{ count: number }>
  /** Ghi StockMovement SALE */
  recordSaleMovement(input: {
    productId: string
    invoiceItemId: string
    shiftId: string
    staffId: string
    quantity: number
    unitCost: number | null
    reason: string
  }): Promise<void>
}
