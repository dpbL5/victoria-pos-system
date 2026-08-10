// ── Pricing engine — tính tiền chơi từ snapshot (deps-injected, testable) ─────
import { err, ok } from '@/lib/shared/result'
import type { Result } from '@/lib/shared/result'
import {
  calculatePromotionDiscount,
  calculateTieredSubtotal,
  type PromotionSnapshot,
} from '@/lib/promotion-calculation'
import { calcHours, getDayType, getVnHour } from '@/lib/shared/utils'
import type { PricingRuleSnapshot } from '@/types'
import type { SessionRepository, SessionWithDetails } from './ports'
import type { MembershipRepository } from '@/lib/memberships/ports'
import type { PricingRepository } from '@/lib/pricing/ports'

export interface PricingEngineDeps {
  session: Pick<SessionRepository, 'findByIdForCheckout'>
  membership: Pick<MembershipRepository, 'findActive'>
  pricing: Pick<PricingRepository, 'findApplicableRule'>
}

export interface PricingResult {
  hourlyRate: number
  /** Tiers của bảng giá đã resolve — cho tính tiền per-player tại checkout */
  tiers: { minHours: number; ratePerHour: number }[]
  totalHours: number
  subtotal: number
  promotionDiscount: number
  grandTotal: number
  isMemberSession: boolean
  promotion: PromotionSnapshot | null
  /** Tên bảng giá đã resolve (snapshot) — hiển thị trên hoá đơn */
  ruleName?: string
  /** Hội viên nhưng gói đã hết hạn tại thời điểm tính (endTime) — cần renew trước khi thu tiền */
  membershipExpired?: boolean
}

/**
 * Bảng giá chưa persist — chọn tại checkout cho session mới (check-in để trống giá).
 * groupId có khi nhóm trống đã tồn tại trong DB (Nhóm 1), undefined cho nhóm tạo mới.
 */
export interface PendingGroupPricing {
  groupId?: string
  playerCount: number
  snapshot: PricingRuleSnapshot
}

/**
 * Tính tiền chơi cho session — snapshot-first:
 * - pricingGroupId → snapshot của SessionPricingGroup
 * - pendingGroups → bảng giá chọn tại checkout (session mới)
 * - Session.pricingRuleSnapshot → snapshot lúc check-in
 * - Fallback resolve lại rule từ DB (tương thích session cũ)
 *
 * Hội viên còn hạn → 0đ. hourTo độc quyền. Không có rule phù hợp →
 * err('PRICING_RULE_NOT_FOUND') (không fallback giá mặc định).
 */
export async function calculateSessionPrice(
  deps: PricingEngineDeps,
  sessionId: string,
  endTime: Date,
  promotion: PromotionSnapshot | null = null,
  pricingGroupId?: string,
  pendingGroups?: PendingGroupPricing[],
  pendingIndex = 0,
  pausedSeconds = 0
): Promise<Result<PricingResult>> {
  const session = await deps.session.findByIdForCheckout(sessionId)
  if (!session) return err('SESSION_NOT_FOUND')

  return calculateSessionPriceFromLoaded(deps, session, endTime, promotion, pricingGroupId, pendingGroups, pendingIndex, pausedSeconds)
}

/** Core tính toán trên session đã load — pure với deps cho fallback DB */
export async function calculateSessionPriceFromLoaded(
  deps: PricingEngineDeps,
  session: SessionWithDetails,
  endTime: Date,
  promotion: PromotionSnapshot | null = null,
  pricingGroupId?: string,
  pendingGroups?: PendingGroupPricing[],
  pendingIndex = 0,
  pausedSeconds = 0
): Promise<Result<PricingResult>> {
  const totalHours = calcHours(session.startTime, endTime, pausedSeconds)

  // ── Membership: ưu tiên relation (kèm sẵn), fallback findActive.
  // Quan trọng: kiểm tra hạn tại endTime (thời điểm thu tiền), KHÔNG phải session.startTime —
  // nếu gói hết hạn giữa phiên phải báo để renew, không tính 0đ.
  let activeMembership = session.membership && session.membership.expiresAt >= endTime
    ? session.membership
    : null
  if (!activeMembership && session.customer?.type === 'MEMBER' && session.customerId) {
    activeMembership = await deps.membership.findActive(session.customerId, endTime)
  }

  if (session.customer?.type === 'MEMBER') {
    if (activeMembership) {
      return ok({
        hourlyRate: 0,
        tiers: [],
        totalHours,
        subtotal: 0,
        promotionDiscount: 0,
        grandTotal: 0,
        isMemberSession: true,
        promotion: null,
        ruleName: '',
      })
    }
    // Hội viên hết hạn tại thời điểm thu tiền — trả cờ để preview/checkout báo renew
    return ok({
      hourlyRate: 0,
      tiers: [],
      totalHours,
      subtotal: 0,
      promotionDiscount: 0,
      grandTotal: 0,
      isMemberSession: false,
      promotion: null,
      ruleName: '',
      membershipExpired: true,
    })
  }

  let hourlyRate: number
  let tiers: { minHours: number; ratePerHour: number }[] = []
  let ruleName = ''

  // ── Nếu có pendingGroups (bảng giá chọn tại checkout) — ưu tiên cao nhất ──
  const pending = pendingGroups?.[pendingIndex]
  if (pending) {
    hourlyRate = pending.snapshot.ratePerHour
    tiers = pending.snapshot.tiers.map((t) => ({
      minHours: t.minHours,
      ratePerHour: t.ratePerHour,
    }))
    ruleName = pending.snapshot.name
  } else if (pricingGroupId) {
    // ── Nếu có pricingGroupId, dùng snapshot của group đó ──
    const group = session.pricingGroups.find(g => g.id === pricingGroupId)
    if (!group || group.remainingCount <= 0) return err('PRICING_GROUP_NOT_FOUND')
    const snapshot = group.pricingSnapshot as PricingRuleSnapshot | null
    if (snapshot) {
      hourlyRate = snapshot.ratePerHour
      tiers = snapshot.tiers.map((t) => ({
        minHours: t.minHours,
        ratePerHour: t.ratePerHour,
      }))
      ruleName = snapshot.name
    } else {
      hourlyRate = Number(group.hourlyRate)
    }
  } else {
    // ── Dùng bảng giá đã snapshot lúc check-in trên session nếu có ──
    const snapshot = (session as { pricingRuleSnapshot?: PricingRuleSnapshot | null }).pricingRuleSnapshot
    if (snapshot) {
      hourlyRate = snapshot.ratePerHour
      tiers = snapshot.tiers.map((t) => ({
        minHours: t.minHours,
        ratePerHour: t.ratePerHour,
      }))
      ruleName = snapshot.name
    } else {
      // ── Fallback: resolve lại bảng giá từ DB (tương thích session cũ) ──
      const currentHour = getVnHour(session.startTime)
      const dayType = getDayType(session.startTime)
      const applicableRule = await deps.pricing.findApplicableRule(currentHour, dayType, session.startTime)

      if (applicableRule) {
        hourlyRate = Number(applicableRule.ratePerHour)
        tiers = applicableRule.tiers.map((t) => ({
          minHours: t.minHours,
          ratePerHour: Number(t.ratePerHour),
        }))
        ruleName = applicableRule.name
      } else {
        hourlyRate = Number(session.hourlyRate)
        if (!hourlyRate) {
          return err('PRICING_RULE_NOT_FOUND')
        }
      }
    }
  }

  // Tính tiền luỹ tiến theo các mức giá: mỗi phân khúc giờ dùng mức giá riêng
  const progressiveSubtotal = calculateTieredSubtotal(hourlyRate, tiers, totalHours)

  // Promotion discount tính trên progressive subtotal
  const promotionDiscount = promotion
    ? calculatePromotionDiscount({ totalHours, subtotal: progressiveSubtotal, promotion })
    : 0

  const grandTotal = Math.max(0, progressiveSubtotal - promotionDiscount)

  return ok({
    hourlyRate,
    tiers,
    totalHours,
    subtotal: progressiveSubtotal,
    promotionDiscount,
    grandTotal,
    isMemberSession: false,
    promotion,
    ruleName,
  })
}

// ── Tính tiền giờ chơi theo từng người chơi (checkout per-player) ──

export interface PlayerPricingParams {
  startTime: Date
  endTime: Date
  /** Giây tạm dừng riêng của player — played time = elapsed − paused */
  pausedSeconds: number
  hourlyRate: number
  tiers: { minHours: number; ratePerHour: number }[]
  promotion: PromotionSnapshot | null
}

export interface PlayerPricingResult {
  /** Played time riêng (giờ, đã trừ pause) */
  totalHours: number
  /** Tiền giờ chơi riêng (tiered subtotal) */
  subtotal: number
  /** Khuyến mại riêng (clamp theo subtotal) */
  promotionDiscount: number
  /** Số tiền người chơi này phải trả cho giờ chơi */
  grandTotal: number
  pausedSeconds: number
}

/**
 * Tính tiền giờ chơi cho 1 người chơi — pure function (không deps).
 * Khi checkout từng người: gọi hàm này cho từng player, cộng tổng lại.
 */
export function calculatePlayerPrice(params: PlayerPricingParams): PlayerPricingResult {
  const { startTime, endTime, pausedSeconds, hourlyRate, tiers, promotion } = params
  // Played time = thời gian chơi thực (elapsed − pause), không phải paused time
  const totalHours = calcHours(startTime, endTime, pausedSeconds)
  const subtotal = calculateTieredSubtotal(hourlyRate, tiers, totalHours)
  const promotionDiscount = promotion
    ? calculatePromotionDiscount({ totalHours, subtotal, promotion })
    : 0
  return {
    totalHours,
    subtotal,
    promotionDiscount,
    grandTotal: Math.max(0, subtotal - promotionDiscount),
    pausedSeconds,
  }
}
