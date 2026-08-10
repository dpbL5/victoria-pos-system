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
  totalHours: number
  subtotal: number
  promotionDiscount: number
  grandTotal: number
  isMemberSession: boolean
  promotion: PromotionSnapshot | null
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

  const activeMembership = session.membership
    ?? (session.customer?.type === 'MEMBER' && session.customerId
      ? await deps.membership.findActive(session.customerId, session.startTime)
      : null)

  if (session.customer?.type === 'MEMBER' && activeMembership) {
    return ok({
      hourlyRate: 0,
      totalHours,
      subtotal: 0,
      promotionDiscount: 0,
      grandTotal: 0,
      isMemberSession: true,
      promotion: null,
    })
  }

  let hourlyRate: number
  let tiers: { minHours: number; ratePerHour: number }[] = []

  // ── Nếu có pendingGroups (bảng giá chọn tại checkout) — ưu tiên cao nhất ──
  const pending = pendingGroups?.[pendingIndex]
  if (pending) {
    hourlyRate = pending.snapshot.ratePerHour
    tiers = pending.snapshot.tiers.map((t) => ({
      minHours: t.minHours,
      ratePerHour: t.ratePerHour,
    }))
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
    totalHours,
    subtotal: progressiveSubtotal,
    promotionDiscount,
    grandTotal,
    isMemberSession: false,
    promotion,
  })
}
