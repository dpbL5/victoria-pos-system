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

/** Dòng phiên trong danh sách — GET /api/sessions */
export type SessionListRow = Prisma.SessionGetPayload<{
  select: {
    id: true
    startTime: true
    endTime: true
    status: true
    hourlyRate: true
    pricingRuleId: true
    pricingRuleSnapshot: true
    totalHours: true
    subtotal: true
    discountAmount: true
    totalAmount: true
    playerCount: true
    promotionRuleId: true
    promotionName: true
    promotionDiscountType: true
    promotionDiscountValue: true
    customer: { select: { id: true; fullName: true; phone: true; type: true } }
    staff: { select: { id: true; fullName: true } }
    membership: { select: { id: true; startsAt: true; expiresAt: true } }
    shift: { select: { id: true; openedAt: true; status: true } }
    pricingGroups: {
      select: {
        id: true
        label: true
        playerCount: true
        remainingCount: true
        hourlyRate: true
        pricingRuleId: true
        pricingSnapshot: true
      }
      orderBy: { createdAt: 'asc' }
    }
  }
}>

export interface SessionListFilter {
  status?: string
  customerId?: string
  date?: string
  skip: number
  take: number
}

/** Preview checkout — session + pricingGroups (cho tính giá) */
export type SessionPreviewRow = Prisma.SessionGetPayload<{
  select: {
    id: true
    status: true
    playerCount: true
    pricingGroups: {
      select: {
        id: true
        label: true
        playerCount: true
        remainingCount: true
        hourlyRate: true
        pricingRuleId: true
        pricingSnapshot: true
      }
      orderBy: { createdAt: 'asc' }
    }
  }
}>

export interface SessionRepository {
  /** Session + customer + membership + pricingGroups (orderBy createdAt asc) — cho checkout */
  findByIdForCheckout(id: string): Promise<SessionWithDetails | null>
  /** Session + customer — cho sellItems */
  findByIdWithCustomer(id: string): Promise<SessionWithCustomer | null>
  /** Phiên ACTIVE hiện có của khách (chặn check-in trùng) */
  findActiveByCustomer(customerId: string): Promise<{ id: string } | null>
  /** Danh sách phiên (filter + phân trang) — GET /api/sessions */
  findMany(input: SessionListFilter): Promise<{ rows: SessionListRow[]; total: number }>
  /** Session + pricingGroups — cho checkout-preview */
  findByIdForPreview(id: string): Promise<SessionPreviewRow | null>
  /** Tổng grandTotal của DRAFT invoices theo từng session — enrich pendingSellTotal */
  findDraftSellTotals(sessionIds: string[]): Promise<Record<string, number>>
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

export interface ProductRecord {
  id: string
  name: string
  type: 'PRODUCT' | 'SERVICE'
  price: number
  costPrice: number | null
  stockQuantity: number
  isActive: boolean
}

/** Dòng sản phẩm cho admin — costPrice cố ý loại (dữ liệu nhạy cảm) */
export type ProductAdminRow = Prisma.ProductGetPayload<{
  select: {
    id: true
    name: true
    sku: true
    type: true
    price: true
    stockQuantity: true
    minStockLevel: true
    isActive: true
    createdAt: true
    updatedAt: true
  }
}>

/** Product đầy đủ (cả costPrice) — cho admin edit/stock */
export type ProductAdminDetail = Prisma.ProductGetPayload<object>

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
  /** Danh sách sản phẩm cho admin (search/isActive, exclude costPrice) — GET /api/products */
  findManyForAdmin(input: { search?: string; isActive?: boolean; take?: number }): Promise<ProductAdminRow[]>
  /** Product đầy đủ (kèm stock) — cho POST stock & PUT product */
  findByIdAdmin(id: string): Promise<ProductAdminDetail | null>
  /** Tạo product + StockMovement RESTOCK tồn đầu kỳ (PRODUCT) — trong 1 transaction */
  createWithInitialStock(input: {
    name: string
    sku: string | null
    type: 'PRODUCT' | 'SERVICE'
    price: number
    costPrice: number | null
    stockQuantity: number
    minStockLevel: number
    isActive: boolean
    staffId: string
  }): Promise<ProductAdminDetail>
  /** Ghi StockMovement (RESTOCK/ADJUSTMENT) + cập nhật stockQuantity — POST /api/products/[id]/stock */
  applyStockMovement(input: {
    productId: string
    staffId: string
    type: 'RESTOCK' | 'ADJUSTMENT'
    quantity: number
    unitCost: number | null
    reason: string | null
    shiftId: string | null
  }): Promise<{ movementId: string; before: number; after: number; shiftId: string | null; type: string; quantity: number }>
}
