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

/** Session + pricingGroups kèm players — cho pause theo người + checkout group-aware */
export type SessionWithPlayers = Prisma.SessionGetPayload<{
  include: {
    customer: true
    membership: true
    pricingGroups: {
      orderBy: { createdAt: 'asc' }
      include: { players: true }
    }
  }
}>

export type SessionWithCustomer = Prisma.SessionGetPayload<{
  include: { customer: true }
}> & { customerName: string | null }

/** Chỉ đủ dữ liệu cho pause/resume theo người chơi — không tải customer/membership nặng */
export type SessionPlayersForPause = Prisma.SessionGetPayload<{
  select: {
    id: true
    status: true
    playerCount: true
    totalPausedSeconds: true
    pausedAt: true
    pricingGroups: {
      select: {
        id: true
        players: {
          select: { id: true, pausedAt: true, totalPausedSeconds: true }
        }
      }
    }
  }
}>

export type SessionRefs = Prisma.SessionGetPayload<{
  include: {
    customer: { select: { id: true; fullName: true; type: true } }
    membership: { select: { id: true; startsAt: true; expiresAt: true } }
    shift: { select: { id: true; openedAt: true; status: true } }
  }
}> & { customerName: string | null }

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
    customerName: true
    pausedAt: true
    totalPausedSeconds: true
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
        players: {
          select: { id: true, name: true, pausedAt: true, totalPausedSeconds: true, checkedOutAt: true }
          orderBy: { createdAt: 'asc' }
        }
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
        players: {
          select: { id: true, name: true, pausedAt: true, totalPausedSeconds: true, checkedOutAt: true }
          orderBy: { createdAt: 'asc' }
        }
      }
      orderBy: { createdAt: 'asc' }
    }
  }
}>

/** Dòng bán kèm tạm trên phiên — chưa phải hóa đơn; checkout gộp vào invoice INV */
export type SessionSellItemRecord = {
  id: string
  sessionId: string
  productId: string
  quantity: number
  unitPrice: number
  unitCost: number | null
  notes: string | null
  createdAt: Date
}

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
  /** Tổng grandTotal của các dòng bán kèm chờ thu theo từng session — enrich pendingSellTotal */
  findSellItemTotals(sessionIds: string[]): Promise<Record<string, number>>
  /** Đếm session tạo trong khoảng thời gian (đặt tên khách vãng lai `Khách #NNN`) */
  countCreatedBetween(from: Date, to: Date): Promise<number>
  /** Tạo session kèm customer/membership/shift refs */
  createWithRefs(data: CreateSessionData): Promise<SessionRefs>
  createPricingGroup(data: CreatePricingGroupData): Promise<{ id: string }>
  /** Gán bảng giá (snapshot) cho pricing group — dùng khi chọn bảng giá tại checkout */
  updatePricingGroup(groupId: string, data: UpdatePricingGroupData): Promise<void>
  /** Unchecked update — cho phép set trực tiếp shiftId, playerCount, promotion fields... */
  update(id: string, data: Prisma.SessionUncheckedUpdateInput): Promise<void>
  /** Giảm remainingCount của group — trả về remainingCount mới */
  decrementGroupRemaining(groupId: string, count: number): Promise<{ remainingCount: number }>
  /** Tổng remainingCount của tất cả groups trong session */
  sumRemainingPlayers(sessionId: string): Promise<number>
  /** Session + pricingGroups kèm players — cho checkout-preview + checkout group-aware */
  findByIdWithPlayers(id: string): Promise<SessionWithPlayers | null>
  /** Session nhẹ (chỉ status + players) — cho pause/resume theo người chơi, giảm payload */
  findPlayersForPause(id: string): Promise<SessionPlayersForPause | null>
  /** Đặt pausedAt cho 1 người chơi (theo group) */
  pausePlayer(playerId: string, pausedAt: Date): Promise<void>
  /** Resume 1 người chơi: clear pausedAt + increment totalPausedSeconds */
  resumePlayer(playerId: string, pausedSeconds: number): Promise<void>
  /** Đổi tên 1 người chơi — chỉ update name, giữ nguyên id (định danh timer/pause/pricing) */
  renamePlayer(playerId: string, name: string | null): Promise<void>
  /** Tạo N SessionPlayer (tên trống, pause 0) cho 1 group — gọi khi check-in */
  createPlayersForGroup(sessionId: string, groupId: string, count: number): Promise<void>
  /** Chuyển danh sách player sang group khác (chia nhiều bảng giá tại checkout) */
  movePlayersToGroup(playerIds: string[], groupId: string): Promise<void>
  /** Đánh dấu các player đã được tính tiền (checkout từng phần) */
  markPlayersCheckedOut(playerIds: string[], checkedOutAt: Date): Promise<void>
  /** Các dòng bán kèm chờ thu của phiên — cho checkout/preview */
  findSellItems(sessionId: string): Promise<SessionSellItemRecord[]>
  /** Thêm dòng bán kèm — upsert theo productId (cộng quantity nếu đã có) */
  addSellItem(input: {
    sessionId: string
    productId: string
    quantity: number
    unitPrice: number
    unitCost: number | null
    notes?: string | null
  }): Promise<void>
  /** Xoá các dòng bán kèm (đã checkout/huỷ) */
  removeSellItems(ids: string[]): Promise<void>
  /** Xoá toàn bộ dòng bán kèm của phiên — phiên huỷ/hoàn tất */
  clearSellItems(sessionId: string): Promise<void>
}

/** Pause giây đã tích lũy của 1 player tại thời điểm now (gồm cả đang tạm dừng) */
export function playerPausedSeconds(
  player: { pausedAt: Date | null; totalPausedSeconds: number },
  now: Date
): number {
  let seconds = player.totalPausedSeconds
  if (player.pausedAt) {
    seconds += Math.round(Math.max(0, (now.getTime() - new Date(player.pausedAt).getTime()) / 1000))
  }
  return seconds
}

/** Pause giây của 1 group = tổng các player + phần đang tạm dừng */
export function groupPausedSeconds(
  group: { players: Array<{ pausedAt: Date | null; totalPausedSeconds: number }> },
  now: Date
): number {
  return group.players.reduce((sum, player) => sum + playerPausedSeconds(player, now), 0)
}

export interface CreateSessionData {
  customerId: string | null
  /** Tên khách vãng lai — null khi là hội viên (lấy từ customer.fullName) */
  customerName?: string | null
  staffId: string
  shiftId: string
  membershipId?: string
  startTime: Date
  hourlyRate: number
  pricingRuleId?: string | null
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
  pricingRuleId?: string | null
  /** null cho session hội viên (không tính tiền giờ) */
  pricingSnapshot: PricingRuleSnapshot | null
}

export interface UpdatePricingGroupData {
  label?: string
  playerCount?: number
  remainingCount?: number
  /** null khi xoá bảng giá đã gán */
  pricingRuleId?: string | null
  pricingSnapshot: PricingRuleSnapshot | null
  hourlyRate?: number
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
    invoiceItemId: string | null
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
