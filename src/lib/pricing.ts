import { findActiveMembership } from '@/lib/business/memberships'
import {
  calculatePromotionDiscount,
  calculateTieredSubtotal,
  type PromotionSnapshot,
} from '@/lib/promotion-calculation'
import { prisma } from '@/lib/prisma'
import { calcHours, getDayType, getVnDay, getVnHour } from '@/lib/utils'
import type { DayType, PricingRuleSnapshot } from '@/types'

export interface PricingResult {
  hourlyRate: number
  totalHours: number
  subtotal: number
  promotionDiscount: number
  grandTotal: number
  isMemberSession: boolean
  promotion: PromotionSnapshot | null
}

export async function findApplicableRate(
  currentHour: number,
  dayType: DayType,
  at: Date = new Date()
): Promise<number> {
  const rule = await findApplicablePricingRule(currentHour, dayType, at)
  if (!rule) throw new Error('PRICING_RULE_NOT_FOUND')
  return Number(rule.ratePerHour)
}

/**
 * Lấy danh sách bảng giá đang hiệu lực ở thời điểm hiện tại (cho UI dropdown chọn bảng giá).
 */
export async function getApplicablePricingRules(at: Date = new Date()) {
  return prisma.pricingRule.findMany({
    where: pricingRuleWhere(getVnHour(at), getDayType(at), at),
    include: { tiers: { orderBy: { minHours: 'asc' } } },
    orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
  })
}

/**
 * Fetch rule + tiers theo ID để snapshot vào session khi check-in.
 */
export async function fetchPricingRuleForSnapshot(ruleId: string) {
  const rule = await prisma.pricingRule.findUnique({
    where: { id: ruleId },
    include: { tiers: { orderBy: { minHours: 'asc' } } },
  })
  return rule
}

export async function countApplicablePricingRules(at: Date = new Date()): Promise<number> {
  return prisma.pricingRule.count({
    where: pricingRuleWhere(getVnHour(at), getDayType(at), at),
  })
}

export interface OverlapInfo {
  id: string
  name: string
  daysOfWeek: number[]
  hourFrom: number
  hourTo: number | null
  effectiveFrom: Date
  effectiveTo: Date | null
}

export async function findOverlappingRules(
  daysOfWeek: number[],
  hourFrom: number,
  hourTo: number | null,
  effectiveFrom: Date,
  effectiveTo: Date | null,
  excludeId?: string,
): Promise<OverlapInfo[]> {
  const effectiveEnd = effectiveTo ?? new Date('2099-12-31')
  const hTo = hourTo ?? 24
  const normalizedDays = normalizeDaysOfWeek(daysOfWeek)

  const rules = await prisma.pricingRule.findMany({
    where: {
      id: excludeId ? { not: excludeId } : undefined,
      hourFrom: { lt: hTo },
      OR: [
        { hourTo: null },
        { hourTo: { gt: hourFrom } },
      ],
      effectiveFrom: { lte: effectiveEnd },
      AND: [{
        OR: [
          { effectiveTo: null },
          { effectiveTo: { gte: effectiveFrom } },
        ],
      }],
    },
    select: {
      id: true,
      name: true,
      daysOfWeek: true,
      dayType: true,
      hourFrom: true,
      hourTo: true,
      effectiveFrom: true,
      effectiveTo: true,
    },
  })

  return rules
    .map((rule) => ({
      ...rule,
      daysOfWeek: resolveRuleDaysOfWeek(rule.daysOfWeek, rule.dayType),
    }))
    .filter((rule) => hasSharedDay(normalizedDays, rule.daysOfWeek))
}

export function deriveDayTypeFromDays(daysOfWeek: number[]): DayType {
  const normalizedDays = normalizeDaysOfWeek(daysOfWeek)
  return normalizedDays.length > 0 && normalizedDays.every((day) => day === 0 || day === 6)
    ? 'WEEKEND'
    : 'WEEKDAY'
}

export function normalizeDaysOfWeek(daysOfWeek: number[]): number[] {
  return [...new Set(daysOfWeek)]
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    .sort((left, right) => left - right)
}

export function resolveRuleDaysOfWeek(daysOfWeek: number[] | null | undefined, dayType: DayType): number[] {
  const normalizedDays = normalizeDaysOfWeek(daysOfWeek ?? [])
  if (normalizedDays.length > 0) return normalizedDays
  return dayType === 'WEEKEND' ? [0, 6] : [1, 2, 3, 4, 5]
}

export async function calculateSessionPrice(
  sessionId: string,
  endTime: Date,
  promotion: PromotionSnapshot | null = null,
  pricingGroupId?: string
): Promise<PricingResult> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      customer: true,
      membership: true,
      pricingGroups: true,
    },
  })

  if (!session) throw new Error('SESSION_NOT_FOUND')

  const totalHours = calcHours(session.startTime, endTime)

  const activeMembership = session.membership
    ?? (session.customer.type === 'MEMBER'
      ? await findActiveMembership(prisma, session.customerId, session.startTime)
      : null)

  if (session.customer.type === 'MEMBER' && activeMembership) {
    return {
      hourlyRate: 0,
      totalHours,
      subtotal: 0,
      promotionDiscount: 0,
      grandTotal: 0,
      isMemberSession: true,
      promotion: null,
    }
  }

  let hourlyRate: number
  let tiers: { minHours: number; ratePerHour: number }[] = []

  // ── Nếu có pricingGroupId, dùng snapshot của group đó ──
  if (pricingGroupId) {
    const group = session.pricingGroups.find(g => g.id === pricingGroupId)
    if (!group || group.remainingCount <= 0) throw new Error('PRICING_GROUP_NOT_FOUND')
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
    const snapshot = (session as any).pricingRuleSnapshot as PricingRuleSnapshot | null
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
      const applicableRule = await findApplicablePricingRule(currentHour, dayType, session.startTime)

      if (applicableRule) {
        hourlyRate = Number(applicableRule.ratePerHour)
        tiers = await fetchPricingTiers(applicableRule.id)
      } else {
        hourlyRate = Number(session.hourlyRate)
        if (!hourlyRate) {
          hourlyRate = await findApplicableRate(currentHour, dayType, session.startTime)
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

  return {
    hourlyRate,
    totalHours,
    subtotal: progressiveSubtotal,
    promotionDiscount,
    grandTotal,
    isMemberSession: false,
    promotion,
  }
}

/**
 * Lấy danh sách các mức giá luỹ tiến của một quy tắc giá,
 * sắp xếp tăng dần theo minHours.
 */
async function fetchPricingTiers(
  ruleId: string
): Promise<{ minHours: number; ratePerHour: number }[]> {
  const tiers = await prisma.pricingTier.findMany({
    where: { ruleId },
    orderBy: { minHours: 'asc' },
  })
  return tiers.map((t) => ({
    minHours: t.minHours,
    ratePerHour: Number(t.ratePerHour),
  }))
}

export async function findApplicablePricingRule(
  currentHour: number,
  dayType: DayType,
  at: Date
) {
  return prisma.pricingRule.findFirst({
    where: pricingRuleWhere(currentHour, dayType, at),
    orderBy: [
      { effectiveFrom: 'desc' },
      { createdAt: 'desc' },
    ],
  })
}

function pricingRuleWhere(
  currentHour: number,
  dayType: DayType,
  at: Date
) {
  return {
    hourFrom: { lte: currentHour },
    OR: [
      { hourTo: null },
      { hourTo: { gt: currentHour } },
    ],
    effectiveFrom: { lte: at },
    AND: [
      {
        OR: [
          { effectiveTo: null },
          { effectiveTo: { gte: at } },
        ],
      },
      {
        OR: [
          { daysOfWeek: { has: getVnDay(at) } },
          {
            daysOfWeek: { isEmpty: true },
            dayType,
          },
        ],
      },
    ],
  }
}

function hasSharedDay(left: number[], right: number[]): boolean {
  return left.some((day) => right.includes(day))
}
