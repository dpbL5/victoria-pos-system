// ── Checkout quote core — pure, client-safe ─────────────────────────────
// Một nguồn duy nhất cho: chọn người/nhóm được thu, tính tiền từng người,
// chuỗi số của phiếu thu. Server resolver (checkout-quote.ts) nạp dữ liệu rồi
// gọi các hàm ở đây; drawer/precalc cũng dùng calculateReceipt.
//
// Không import Prisma runtime, không import use-case/barrel để client bundle
// không kéo database vào.

import { calculatePromotionDiscount, calculateTieredSubtotal } from '@/lib/promotion-calculation'
import { calcHours, getVnDay } from '@/lib/shared/utils'
import { err, ok } from '@/lib/shared/result'
import type { Result } from '@/lib/shared/result'
import type { PlayTimeQuote, PricingRuleSnapshot, PromotionSnapshot } from '@/types'
import { calculatePlayerPrice } from './pricing-engine'
import {
  groupPausedSeconds,
  playerPauseWithSessionFallback,
  playerPausedSeconds,
  sessionPauseSeconds,
} from './session-pause'

// ── Kiểu dữ liệu đầu vào (structural — không phụ thuộc Prisma payload) ──

export interface QuotePlayer {
  id: string
  name: string | null
  pausedAt: Date | null
  totalPausedSeconds: number
  checkedOutAt: Date | null
  /** Thứ tự trong group — ổn định qua các lần query */
  position: number
}

export interface QuoteGroup {
  id: string
  label: string
  playerCount: number
  remainingCount: number
  hourlyRate: unknown
  pricingRuleId: string | null
  pricingSnapshot: unknown
  players: QuotePlayer[]
}

export interface QuoteBooking {
  id: string
  depositAmount: unknown
  depositAppliedAmount: unknown
  depositRefundedAmount: unknown
  depositInvoiceId: string | null
  depositPaymentMethod: string | null
}

export interface QuoteSession {
  id: string
  customerId: string | null
  startTime: Date
  playerCount: number
  pausedAt: Date | null
  totalPausedSeconds: number
  hourlyRate: unknown
  pricingRuleSnapshot: unknown
  customer: { type: 'WALK_IN' | 'MEMBER' } | null
  membership: { expiresAt: Date } | null
  booking: QuoteBooking | null
  pricingGroups: QuoteGroup[]
}

export interface QuoteRule {
  id: string
  name: string
  ratePerHour: unknown
  tiers: Array<{ minHours: number; ratePerHour: unknown }>
  daysOfWeek: number[]
  effectiveFrom: Date
  effectiveTo: Date | null
}

export interface ResolvedRules {
  byId: Map<string, QuoteRule>
  auto: QuoteRule | null
}

export interface RuleRef {
  hourlyRate: number
  tiers: Array<{ minHours: number; ratePerHour: number }>
  ruleName: string
}

export interface PendingAssignment {
  groupId: string | null
  label: string
  playerCount: number
  pricingRuleId: string
  snapshot: PricingRuleSnapshot
  playerIds: string[]
  preserveCounts?: boolean
}

export interface PendingGroupPricing {
  groupId?: string
  playerCount: number
  snapshot: PricingRuleSnapshot
}

// ── Selection ───────────────────────────────────────────────────────────

export type CheckoutSelection =
  | {
      mode: 'freshGroups'
      groups: Array<{ playerCount: number; pricingRuleId: string; playerIds: string[] }>
    }
  | { mode: 'groupSlice'; pricingGroupId: string; playerCount?: number }
  | {
      mode: 'playerSlice'
      playerIds: string[]
      groupPricingRuleIds?: Record<string, string>
    }
  | { mode: 'legacy'; playerCount?: number }
  | { mode: 'all' }

export interface CheckoutQuoteOptions {
  endTime: Date
  /** Khuyến mại chọn lúc thu — null/undefined = không áp */
  promotionRuleId?: string
  /** Bảng giá fallback cho phiên chưa gán giá (legacy / thu trước) */
  pricingRuleId?: string
  /** Danh sách hàng cuối cùng; undefined = dùng dòng bán kèm đã persist (preview) */
  items?: Array<{ productId: string; quantity: number }>
  parkingVehicleCount?: number
  /** Thời điểm chốt để kiểm hiệu lực bảng giá/pause; mặc định = lúc gọi */
  quoteAt?: Date
}

export interface RuleRequirements {
  explicitRuleIds: string[]
  needsAutoRule: boolean
}

export interface SelectionPlan {
  isMemberSession: boolean
  isFreshPricing: boolean
  hasUnpricedGroups: boolean
  checkoutCount: number
  targetGroupId?: string
  playersToBill: QuotePlayer[]
  playersToBillByGroup?: string[][]
  earlyCollectionGroupIds?: string[]
  groupRuleMap?: Map<number, RuleRef>
  /** Rule nền cho base pricing khi targetGroupId không có (playerSlice) */
  baseRule?: RuleRef
  playerGroupIndex: Map<string, number>
  pendingAssignments: PendingAssignment[]
  pendingGroups: PendingGroupPricing[]
  pausedSeconds: number
}

export function asSnapshot(value: unknown): PricingRuleSnapshot | null {
  return value && typeof value === 'object' ? (value as PricingRuleSnapshot) : null
}

export function toPricingSnapshot(rule: QuoteRule): PricingRuleSnapshot {
  return {
    ruleId: rule.id,
    name: rule.name,
    ratePerHour: Number(rule.ratePerHour),
    tiers: rule.tiers.map((tier) => ({
      minHours: tier.minHours,
      ratePerHour: Number(tier.ratePerHour),
    })),
  }
}

export function ruleRef(rule: QuoteRule): RuleRef {
  return {
    hourlyRate: Number(rule.ratePerHour),
    tiers: rule.tiers.map((tier) => ({
      minHours: tier.minHours,
      ratePerHour: Number(tier.ratePerHour),
    })),
    ruleName: rule.name,
  }
}

export function ruleRefFromSnapshot(snapshot: PricingRuleSnapshot): RuleRef {
  return {
    hourlyRate: snapshot.ratePerHour,
    tiers: snapshot.tiers.map((tier) => ({
      minHours: tier.minHours,
      ratePerHour: tier.ratePerHour,
    })),
    ruleName: snapshot.name,
  }
}

export function isRuleEffectiveAt(rule: QuoteRule, at: Date): boolean {
  const currentDay = getVnDay(at)
  const dayMatches = rule.daysOfWeek.length === 0 || rule.daysOfWeek.includes(currentDay)
  const effectiveFromOk = rule.effectiveFrom <= at
  const effectiveToOk = !rule.effectiveTo || rule.effectiveTo >= at
  return dayMatches && effectiveFromOk && effectiveToOk
}

export function classifySession(session: QuoteSession) {
  const isMemberSession = session.customer?.type === 'MEMBER' || !!session.membership
  const isUnpricedGroup = (group: QuoteGroup) =>
    !asSnapshot(group.pricingSnapshot) && Number(group.hourlyRate) === 0
  const hasUnpricedGroups = !isMemberSession && session.pricingGroups.some(isUnpricedGroup)
  const isFreshPricing =
    !isMemberSession &&
    session.pricingGroups.length > 0 &&
    session.pricingGroups.every(isUnpricedGroup)
  return { isMemberSession, isUnpricedGroup, hasUnpricedGroups, isFreshPricing }
}

/**
 * Cho biết resolver cần nạp bảng giá nào trước khi plan selection.
 * Không tự quyết định mode — chỉ thu thập id cần thiết.
 */
export function collectRuleRequirements(
  session: QuoteSession,
  selection: CheckoutSelection,
  options: CheckoutQuoteOptions
): RuleRequirements {
  const { isMemberSession, isFreshPricing, isUnpricedGroup } = classifySession(session)
  const explicitRuleIds = new Set<string>()
  let needsAutoRule = false

  if (isMemberSession) return { explicitRuleIds: [], needsAutoRule: false }

  if (selection.mode === 'freshGroups') {
    for (const group of selection.groups) explicitRuleIds.add(group.pricingRuleId)
    return { explicitRuleIds: [...explicitRuleIds], needsAutoRule: false }
  }

  if (selection.mode === 'playerSlice') {
    const selected = new Set(selection.playerIds)
    for (const group of session.pricingGroups) {
      if (!isUnpricedGroup(group)) continue
      if (!group.players.some((player) => selected.has(player.id))) continue
      const ruleId = selection.groupPricingRuleIds?.[group.id] ?? options.pricingRuleId
      if (ruleId) explicitRuleIds.add(ruleId)
      else needsAutoRule = true
    }
    return { explicitRuleIds: [...explicitRuleIds], needsAutoRule }
  }

  if (selection.mode === 'all' || selection.mode === 'legacy') {
    if (isFreshPricing) {
      if (options.pricingRuleId) explicitRuleIds.add(options.pricingRuleId)
      else needsAutoRule = true
    } else if (session.pricingGroups.length === 0) {
      if (options.pricingRuleId) explicitRuleIds.add(options.pricingRuleId)
      else if (!asSnapshot(session.pricingRuleSnapshot)) needsAutoRule = true
    }
  }

  return { explicitRuleIds: [...explicitRuleIds], needsAutoRule }
}

function playersById(session: QuoteSession): Map<string, QuotePlayer> {
  return new Map(
    session.pricingGroups.flatMap((group) =>
      group.players.map((player) => [player.id, player] as const)
    )
  )
}

function groupRuleMapFor(
  entries: Array<{ group: QuoteGroup }>,
  pendingGroups: PendingGroupPricing[]
): Map<number, RuleRef> {
  const map = new Map<number, RuleRef>()
  entries.forEach((entry, index) => {
    const snapshot = asSnapshot(entry.group.pricingSnapshot)
    if (snapshot) map.set(index, ruleRefFromSnapshot(snapshot))
    else if (pendingGroups[index]?.snapshot) {
      map.set(index, ruleRefFromSnapshot(pendingGroups[index].snapshot))
    }
  })
  return map
}

function playerGroupIndexFor(playersToBillByGroup?: string[][]): Map<string, number> {
  const map = new Map<string, number>()
  playersToBillByGroup?.forEach((ids, index) => {
    for (const id of ids) map.set(id, index)
  })
  return map
}

export function planSelection(
  session: QuoteSession,
  selection: CheckoutSelection,
  rules: ResolvedRules,
  options: CheckoutQuoteOptions,
  at: Date,
  pauseRef: Date
): Result<SelectionPlan> {
  const { isMemberSession, isFreshPricing, hasUnpricedGroups, isUnpricedGroup } =
    classifySession(session)
  const byId = playersById(session)
  const noPlayers = () => err('NO_PLAYERS_TO_CHECKOUT')

  let checkoutCount = 0
  let targetGroupId: string | undefined
  let playersToBill: QuotePlayer[] = []
  let playersToBillByGroup: string[][] | undefined
  let earlyCollectionGroupIds: string[] | undefined
  let groupRuleMap: Map<number, RuleRef> | undefined
  let baseRule: RuleRef | undefined
  let pendingAssignments: PendingAssignment[] = []
  let pendingGroups: PendingGroupPricing[] = []

  if (selection.mode === 'freshGroups') {
    if (!isFreshPricing) return err('GROUP_PLAYER_COUNT_MISMATCH')
    const groups = selection.groups
    const totalPlayers = groups.reduce((sum, group) => sum + group.playerCount, 0)
    if (totalPlayers > session.playerCount) return err('GROUP_PLAYER_COUNT_MISMATCH')
    for (const group of groups) {
      if (!Array.isArray(group.playerIds) || group.playerIds.length > group.playerCount) {
        return err('GROUP_PLAYER_COUNT_MISMATCH')
      }
    }
    const isPartial = totalPlayers < session.playerCount
    if (isPartial && groups.length > 1) return err('GROUP_PLAYER_COUNT_MISMATCH')

    const existingGroup = session.pricingGroups[0]
    for (let index = 0; index < groups.length; index += 1) {
      const input = groups[index]
      const rule = rules.byId.get(input.pricingRuleId)
      if (!rule) return err('PRICING_RULE_NOT_FOUND')
      if (!isRuleEffectiveAt(rule, at)) return err('PRICING_RULE_NOT_EFFECTIVE')
      const snapshot = toPricingSnapshot(rule)
      pendingAssignments.push({
        groupId: index === 0 ? (existingGroup?.id ?? null) : null,
        label: `Nhóm ${index + 1}`,
        playerCount: input.playerCount,
        pricingRuleId: rule.id,
        snapshot,
        playerIds: input.playerIds,
        preserveCounts: isPartial,
      })
      pendingGroups.push({
        groupId: index === 0 ? existingGroup?.id : undefined,
        playerCount: input.playerCount,
        snapshot,
      })
    }

    const validGroups = groups.map((group) => ({
      ...group,
      playerIds: group.playerIds.filter((id) => {
        const player = byId.get(id)
        return !!player && !player.checkedOutAt
      }),
    }))
    const allIds = validGroups.flatMap((group) => group.playerIds)
    if (allIds.length === 0) return noPlayers()

    checkoutCount = allIds.length
    playersToBillByGroup = validGroups.map((group) => group.playerIds)
    playersToBill = allIds
      .map((id) => byId.get(id))
      .filter((player): player is QuotePlayer => !!player)
    // groupRuleMap theo snapshot của chính pendingGroups (index-aligned với nhóm).
    groupRuleMap = new Map(
      pendingGroups.map((pending, index) => [index, ruleRefFromSnapshot(pending.snapshot)])
    )
  } else if (selection.mode === 'playerSlice') {
    const selectedIds = selection.playerIds.filter((id) => {
      const player = byId.get(id)
      return !!player && !player.checkedOutAt
    })
    if (selectedIds.length === 0) return noPlayers()

    const grouped = session.pricingGroups
      .map((group) => ({
        group,
        ids: group.players
          .filter((player) => !player.checkedOutAt && selectedIds.includes(player.id))
          .map((player) => player.id),
      }))
      .filter((entry) => entry.ids.length > 0)

    checkoutCount = selectedIds.length
    playersToBillByGroup = grouped.map((entry) => entry.ids)
    earlyCollectionGroupIds = grouped.map((entry) => entry.group.id)
    playersToBill = selectedIds
      .map((id) => byId.get(id))
      .filter((player): player is QuotePlayer => !!player)
    groupRuleMap = groupRuleMapFor(grouped, [])

    if (!isMemberSession) {
      for (let index = 0; index < grouped.length; index += 1) {
        const entry = grouped[index]
        if (!isUnpricedGroup(entry.group)) continue
        const ruleId =
          selection.groupPricingRuleIds?.[entry.group.id] ?? undefined
        const rule = ruleId ? rules.byId.get(ruleId) : rules.auto
        if (!rule) return err('PRICING_RULE_NOT_FOUND')
        if (!isRuleEffectiveAt(rule, at)) return err('PRICING_RULE_NOT_EFFECTIVE')
        const snapshot = toPricingSnapshot(rule)
        groupRuleMap.set(index, ruleRefFromSnapshot(snapshot))
        pendingAssignments.push({
          groupId: entry.group.id,
          label: entry.group.label,
          playerCount: entry.group.playerCount,
          pricingRuleId: rule.id,
          snapshot,
          playerIds: [],
          preserveCounts: true,
        })
        pendingGroups.push({
          groupId: entry.group.id,
          playerCount: entry.group.playerCount,
          snapshot,
        })
      }
    }

    // Base pricing cho playerSlice: dùng rule của group chứa người đầu tiên.
    const firstPlayer = playersToBill[0]
    const firstIndex = firstPlayer
      ? playerGroupIndexFor(playersToBillByGroup).get(firstPlayer.id)
      : undefined
    baseRule = firstIndex !== undefined ? groupRuleMap.get(firstIndex) : undefined
  } else if (selection.mode === 'groupSlice') {
    const group = session.pricingGroups.find((candidate) => candidate.id === selection.pricingGroupId)
    if (!group) return err('PRICING_GROUP_NOT_FOUND')
    if (group.remainingCount <= 0) return err('PRICING_GROUP_EMPTY')
    checkoutCount = Math.min(selection.playerCount ?? group.remainingCount, group.remainingCount)
    if (checkoutCount <= 0) return noPlayers()
    targetGroupId = group.id
    playersToBill = group.players.filter((player) => !player.checkedOutAt).slice(0, checkoutCount)
  } else {
    // 'all' | 'legacy'
    const requestedCount = selection.mode === 'legacy' ? selection.playerCount : undefined
    if (isFreshPricing) {
      const rule = options.pricingRuleId
        ? rules.byId.get(options.pricingRuleId)
        : rules.auto
      if (!rule) return err('PRICING_RULE_NOT_FOUND')
      if (!isRuleEffectiveAt(rule, at)) return err('PRICING_RULE_NOT_EFFECTIVE')
      const snapshot = toPricingSnapshot(rule)
      const existingGroup = session.pricingGroups[0]
      pendingAssignments = [{
        groupId: existingGroup?.id ?? null,
        label: 'Nhóm 1',
        playerCount: session.playerCount,
        pricingRuleId: rule.id,
        snapshot,
        playerIds: [],
      }]
      pendingGroups = [{ groupId: existingGroup?.id, playerCount: session.playerCount, snapshot }]
      targetGroupId = existingGroup?.id
      checkoutCount = Math.min(requestedCount ?? session.playerCount, session.playerCount)
      if (checkoutCount <= 0) return noPlayers()
      playersToBill = existingGroup
        ? existingGroup.players.filter((player) => !player.checkedOutAt).slice(0, checkoutCount)
        : []
    } else if (session.pricingGroups.length > 0) {
      const firstGroup = session.pricingGroups.find((group) => group.remainingCount > 0)
      if (!firstGroup) return noPlayers()
      checkoutCount = Math.min(requestedCount ?? firstGroup.remainingCount, firstGroup.remainingCount)
      if (checkoutCount <= 0) return noPlayers()
      targetGroupId = firstGroup.id
      playersToBill = firstGroup.players.filter((player) => !player.checkedOutAt).slice(0, checkoutCount)
    } else {
      checkoutCount = Math.min(requestedCount ?? session.playerCount, session.playerCount)
      if (checkoutCount <= 0) return noPlayers()
    }
  }

  const pausedSeconds = computePausedSeconds(session, playersToBill, targetGroupId, pauseRef, checkoutCount)
  return ok({
    isMemberSession,
    isFreshPricing,
    hasUnpricedGroups,
    checkoutCount,
    targetGroupId,
    playersToBill,
    playersToBillByGroup,
    earlyCollectionGroupIds,
    groupRuleMap,
    baseRule,
    playerGroupIndex: playerGroupIndexFor(playersToBillByGroup),
    pendingAssignments,
    pendingGroups,
    pausedSeconds,
  })
}

function computePausedSeconds(
  session: QuoteSession,
  playersToBill: QuotePlayer[],
  targetGroupId: string | undefined,
  pauseRef: Date,
  checkoutCount: number
): number {
  if (playersToBill.length > 0) {
    return playersToBill.reduce(
      (sum, player) =>
        sum + playerPauseWithSessionFallback(player, session, pauseRef, checkoutCount),
      0
    )
  }
  const hasPlayers = session.pricingGroups.some((group) => group.players.length > 0)
  const targetGroup = targetGroupId
    ? session.pricingGroups.find((group) => group.id === targetGroupId)
    : undefined
  if (hasPlayers && targetGroup) return groupPausedSeconds(targetGroup, pauseRef)
  return sessionPauseSeconds(session, pauseRef)
}

// ── Base pricing (session-level, dùng làm fallback per-player) ──────────

export interface BasePricing {
  hourlyRate: number
  tiers: Array<{ minHours: number; ratePerHour: number }>
  totalHours: number
  subtotal: number
  promotionDiscount: number
  grandTotal: number
  isMemberSession: boolean
  promotion: PromotionSnapshot | null
  ruleName: string
  membershipExpired?: boolean
}

export function resolveBasePricing(
  session: QuoteSession,
  plan: SelectionPlan,
  options: CheckoutQuoteOptions,
  promotion: PromotionSnapshot | null,
  rules: ResolvedRules,
  hasActiveMembership = false
): Result<BasePricing> {
  const totalHours = calcHours(session.startTime, options.endTime, plan.pausedSeconds)

  if (session.customer?.type === 'MEMBER') {
    if (hasActiveMembership) {
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
  let tiers: Array<{ minHours: number; ratePerHour: number }> = []
  let ruleName = ''

  if (plan.pendingGroups.length > 0) {
    const snapshot = plan.pendingGroups[0].snapshot
    hourlyRate = snapshot.ratePerHour
    tiers = snapshot.tiers.map((tier) => ({
      minHours: tier.minHours,
      ratePerHour: tier.ratePerHour,
    }))
    ruleName = snapshot.name
  } else if (plan.targetGroupId) {
    const group = session.pricingGroups.find((candidate) => candidate.id === plan.targetGroupId)
    if (!group) return err('PRICING_GROUP_NOT_FOUND')
    const snapshot = asSnapshot(group.pricingSnapshot)
    if (snapshot) {
      hourlyRate = snapshot.ratePerHour
      tiers = snapshot.tiers.map((tier) => ({
        minHours: tier.minHours,
        ratePerHour: tier.ratePerHour,
      }))
      ruleName = snapshot.name
    } else {
      hourlyRate = Number(group.hourlyRate)
    }
  } else if (plan.baseRule) {
    hourlyRate = plan.baseRule.hourlyRate
    tiers = plan.baseRule.tiers
    ruleName = plan.baseRule.ruleName
  } else {
    const snapshot = asSnapshot(session.pricingRuleSnapshot)
    const explicit = options.pricingRuleId
      ? rules.byId.get(options.pricingRuleId)
      : undefined
    if (snapshot) {
      hourlyRate = snapshot.ratePerHour
      tiers = snapshot.tiers.map((tier) => ({
        minHours: tier.minHours,
        ratePerHour: tier.ratePerHour,
      }))
      ruleName = snapshot.name
    } else if (explicit) {
      hourlyRate = Number(explicit.ratePerHour)
      tiers = explicit.tiers.map((tier) => ({
        minHours: tier.minHours,
        ratePerHour: Number(tier.ratePerHour),
      }))
      ruleName = explicit.name
    } else if (rules.auto) {
      hourlyRate = Number(rules.auto.ratePerHour)
      tiers = rules.auto.tiers.map((tier) => ({
        minHours: tier.minHours,
        ratePerHour: Number(tier.ratePerHour),
      }))
      ruleName = rules.auto.name
    } else {
      hourlyRate = Number(session.hourlyRate)
      if (!hourlyRate) return err('PRICING_RULE_NOT_FOUND')
    }
  }

  const subtotal = calculateTieredSubtotal(hourlyRate, tiers, totalHours)
  const promotionDiscount = promotion
    ? calculatePromotionDiscount({ totalHours, subtotal, promotion })
    : 0
  return ok({
    hourlyRate,
    tiers,
    totalHours,
    subtotal,
    promotionDiscount,
    grandTotal: Math.max(0, subtotal - promotionDiscount),
    isMemberSession: false,
    promotion,
    ruleName,
  })
}

// ── Per-player aggregation ─────────────────────────────────────────────

export interface AggregatedPricing {
  totalHours: number
  hourlyRate: number
  tiers: Array<{ minHours: number; ratePerHour: number }>
  subtotal: number
  promotionDiscount: number
  grandTotal: number
  isMemberSession: boolean
  promotion: PromotionSnapshot | null
  ruleName?: string
  playerPricing?: NonNullable<PlayTimeQuote['playerPricing']>
}

export function aggregatePlayerPricing(
  session: QuoteSession,
  plan: SelectionPlan,
  options: CheckoutQuoteOptions,
  promotion: PromotionSnapshot | null,
  base: BasePricing,
  pauseRef: Date
): AggregatedPricing {
  if (plan.playersToBill.length === 0) {
    return {
      totalHours: base.totalHours * plan.checkoutCount,
      hourlyRate: base.hourlyRate,
      tiers: base.tiers,
      subtotal: base.subtotal * plan.checkoutCount,
      promotionDiscount: base.promotionDiscount * plan.checkoutCount,
      grandTotal: base.grandTotal * plan.checkoutCount,
      isMemberSession: base.isMemberSession,
      promotion,
      ruleName: base.ruleName,
      playerPricing: [],
    }
  }

  const results = plan.playersToBill.map((player) => {
    const groupIndex = plan.playerGroupIndex.get(player.id)
    const groupRule = groupIndex !== undefined ? plan.groupRuleMap?.get(groupIndex) : undefined
    const pausedSeconds = playerPauseWithSessionFallback(
      player,
      session,
      pauseRef,
      plan.checkoutCount
    )
    const result = calculatePlayerPrice({
      startTime: session.startTime,
      endTime: options.endTime,
      pausedSeconds,
      hourlyRate: groupRule?.hourlyRate ?? base.hourlyRate,
      tiers: groupRule?.tiers ?? base.tiers,
      promotion,
    })
    return {
      player,
      result,
      ruleName: groupRule?.ruleName ?? base.ruleName,
    }
  })

  return {
    totalHours: results.reduce((sum, entry) => sum + entry.result.totalHours, 0),
    hourlyRate: base.hourlyRate,
    tiers: base.tiers,
    subtotal: results.reduce((sum, entry) => sum + entry.result.subtotal, 0),
    promotionDiscount: results.reduce((sum, entry) => sum + entry.result.promotionDiscount, 0),
    grandTotal: results.reduce((sum, entry) => sum + entry.result.grandTotal, 0),
    isMemberSession: base.isMemberSession,
    promotion,
    ruleName: base.ruleName,
    playerPricing: results.map(({ player, result, ruleName }) => ({
      id: player.id,
      name: player.name ?? '',
      totalHours: result.totalHours,
      subtotal: result.subtotal,
      discountAmount: result.promotionDiscount,
      total: result.grandTotal,
      pricingRuleName: ruleName,
    })),
  }
}

// ── Pure per-player pricing cho client precalc ─────────────────────────

export interface PricedPlayerRow {
  id: string
  name: string | null
  pausedAt: Date | null
  totalPausedSeconds: number
  hourlyRate: number
  tiers: Array<{ minHours: number; ratePerHour: number }>
  ruleName?: string
}

export interface PricedPlayersResult {
  totalHours: number
  subtotal: number
  discountAmount: number
  grandTotal: number
  playerPricing: NonNullable<PlayTimeQuote['playerPricing']>
}

/**
 * Cộng tiền giờ chơi cho danh sách người chơi đã biết rule — dùng chung cho
 * quote server và precalc client. Trả null khi không có người chơi.
 */
export function pricePlayers(input: {
  startTime: Date
  endTime: Date
  players: PricedPlayerRow[]
  promotion: PromotionSnapshot | null
  /** Fallback session-level cho phiên 1 người cũ chưa đồng bộ pause xuống player */
  sessionPause?: { pausedAt: Date | null; totalPausedSeconds: number }
}): PricedPlayersResult | null {
  if (input.players.length === 0) return null

  const playerPricing: NonNullable<PlayTimeQuote['playerPricing']> = []
  let totalHours = 0
  let subtotal = 0
  let discountAmount = 0
  let grandTotal = 0

  for (const player of input.players) {
    const ownPausedSeconds = playerPausedSeconds(player, input.endTime)
    const pausedSeconds =
      input.players.length === 1 && ownPausedSeconds === 0 && input.sessionPause
        ? sessionPauseSeconds(input.sessionPause, input.endTime)
        : ownPausedSeconds
    const result = calculatePlayerPrice({
      startTime: input.startTime,
      endTime: input.endTime,
      pausedSeconds,
      hourlyRate: player.hourlyRate,
      tiers: player.tiers,
      promotion: input.promotion,
    })
    totalHours += result.totalHours
    subtotal += result.subtotal
    discountAmount += result.promotionDiscount
    grandTotal += result.grandTotal
    playerPricing.push({
      id: player.id,
      name: player.name ?? '',
      totalHours: result.totalHours,
      subtotal: result.subtotal,
      discountAmount: result.promotionDiscount,
      total: result.grandTotal,
      pricingRuleName: player.ruleName,
    })
  }

  return { totalHours, subtotal, discountAmount, grandTotal, playerPricing }
}

// ── Receipt chain ──────────────────────────────────────────────────────

export interface ReceiptInput {
  /** Tiền giờ chơi theo giá niêm yết, trước khuyến mại */
  playGross: number
  /** Hàng hoá/dịch vụ: dòng đã thêm vào phiên + dòng chọn lúc thu */
  itemsTotal: number
  /** Khuyến mại giờ chơi, số dương */
  discount: number
  /** Phí gửi xe, số dương */
  parkingTotal: number
  /** Tiền cọc còn lại của lịch đặt, số dương */
  depositRemaining: number
}

export interface Receipt {
  charges: number
  total: number
  depositApplied: number
  payable: number
}

export function calculateReceipt(input: ReceiptInput): Receipt {
  const charges = Math.max(0, input.playGross) + Math.max(0, input.itemsTotal)
  const total = Math.max(
    0,
    charges - Math.max(0, input.discount) - Math.max(0, input.parkingTotal)
  )
  const depositApplied = Math.min(Math.max(0, input.depositRemaining), total)
  return { charges, total, depositApplied, payable: total - depositApplied }
}

// ── Helpers dùng chung cho quote assembly ──────────────────────────────

export function depositRemainingOf(session: QuoteSession): number {
  if (!session.booking) return 0
  return Math.max(
    0,
    Number(session.booking.depositAmount) -
      Number(session.booking.depositAppliedAmount) -
      Number(session.booking.depositRefundedAmount)
  )
}

export function pausedSecondsForGroup(group: QuoteGroup, at: Date): number | undefined {
  return group.players.length > 0 ? groupPausedSeconds(group, at) : undefined
}

export function canApplyPromotion(isMemberSession: boolean, promotionRuleId?: string): boolean {
  return !(isMemberSession && promotionRuleId)
}

export function ruleLookup(
  rules: QuoteRule[],
  auto: QuoteRule | null
): ResolvedRules {
  return { byId: new Map(rules.map((rule) => [rule.id, rule])), auto }
}
