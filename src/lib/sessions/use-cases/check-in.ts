// ── Use-case: checkIn — check-in khách vãng lai / hội viên ─────
import { err, ok } from '@/lib/shared/result'
import type { DomainError, Result } from '@/lib/shared/result'
import { fail, runInTransaction } from '@/lib/infrastructure/db-helpers'
import type { Repositories } from '@/lib/infrastructure/repositories'
import { repositories } from '@/lib/infrastructure/repositories'
import type { HttpErrorInfo } from '@/lib/infrastructure/api-helpers'
import { getDayType, getVnDay, getVnHour, parseEndOfDay, parseStartOfDay } from '@/lib/utils'
import type { PricingRuleSnapshot } from '@/types'
import type { PricingRepository } from '@/lib/pricing/ports'

export interface CheckInInput {
  staffId: string
  customerId?: string
  pricingRuleId?: string
  playerCount?: number
  groups?: Array<{ playerCount: number; pricingRuleId: string }>
  now?: Date
}

export interface CheckInResult {
  id: string
  customerId: string
  staffId: string
  shiftId: string | null
  membershipId: string | null
  startTime: Date
  hourlyRate: number
  pricingRuleId: string | null
  pricingRuleSnapshot: PricingRuleSnapshot | null
  playerCount: number
  status: 'ACTIVE'
  customer: { id: string; fullName: string; type: 'WALK_IN' | 'MEMBER' }
  membership: { id: string; startsAt: Date; expiresAt: Date } | null
  shift: { id: string; openedAt: Date; status: 'OPEN' | 'CLOSED' } | null
}

interface ResolvedGroup {
  playerCount: number
  pricingRuleId: string
  pricingRuleSnapshot: PricingRuleSnapshot
}

interface ResolvedSnapshot {
  pricingRuleId: string
  pricingRuleSnapshot: PricingRuleSnapshot
}

/**
 * Resolve bảng giá + tiers → snapshot (pre-transaction).
 * - pricingRuleId được chọn: kiểm tra rule còn hiệu lực đúng ngày/giờ.
 * - Không có id: auto-resolve rule phù hợp nhất (không fallback giá mặc định).
 */
async function resolvePricingSnapshot(
  pricing: PricingRepository,
  pricingRuleId: string | undefined,
  now: Date,
): Promise<Result<ResolvedSnapshot>> {
  if (pricingRuleId) {
    const rule = await pricing.findByIdWithTiers(pricingRuleId)
    if (!rule) return err('PRICING_RULE_NOT_FOUND')

    // Kiểm tra bảng giá còn hiệu lực ở thời điểm check-in
    const currentDay = getVnDay(now)
    const dayMatches =
      rule.daysOfWeek.length === 0 || rule.daysOfWeek.includes(currentDay)
    const effectiveFromOk = rule.effectiveFrom <= now
    const effectiveToOk = !rule.effectiveTo || rule.effectiveTo >= now

    if (!dayMatches || !effectiveFromOk || !effectiveToOk) {
      return err('PRICING_RULE_NOT_EFFECTIVE')
    }

    return ok({
      pricingRuleId: rule.id,
      pricingRuleSnapshot: {
        ruleId: rule.id,
        name: rule.name,
        ratePerHour: Number(rule.ratePerHour),
        tiers: rule.tiers.map((t) => ({
          minHours: t.minHours,
          ratePerHour: Number(t.ratePerHour),
        })),
      },
    })
  }

  // Auto-resolve: tìm bảng giá phù hợp nhất theo giờ/ngày hiện tại
  const currentHour = getVnHour(now)
  const dayType = getDayType(now)
  const rule = await pricing.findApplicableRule(currentHour, dayType, now)
  if (!rule) return err('PRICING_RULE_NOT_FOUND')

  return ok({
    pricingRuleId: rule.id,
    pricingRuleSnapshot: {
      ruleId: rule.id,
      name: rule.name,
      ratePerHour: Number(rule.ratePerHour),
      tiers: rule.tiers.map((t) => ({
        minHours: t.minHours,
        ratePerHour: Number(t.ratePerHour),
      })),
    },
  })
}

async function resolveGroups(
  pricing: PricingRepository,
  groups: Array<{ playerCount: number; pricingRuleId: string }>,
  now: Date,
): Promise<Result<ResolvedGroup[]>> {
  const results = await Promise.all(
    groups.map((g) => resolvePricingSnapshot(pricing, g.pricingRuleId, now))
  )
  const resolved: ResolvedGroup[] = []
  for (let i = 0; i < results.length; i += 1) {
    const r = results[i]
    if (!r.ok) return r
    resolved.push({ ...groups[i], ...r.value })
  }
  return ok(resolved)
}

export async function checkIn(
  input: CheckInInput,
  deps: Repositories = repositories
): Promise<Result<CheckInResult>> {
  const { staffId, customerId, pricingRuleId, playerCount = 1, groups, now = new Date() } = input

  if (!customerId) {
    return checkInAnonymousWalkIn({ staffId, pricingRuleId, playerCount, groups, now }, deps)
  }

  return checkInRegisteredCustomer({ staffId, customerId, pricingRuleId, playerCount, groups, now }, deps)
}

async function checkInAnonymousWalkIn(
  input: {
    staffId: string
    pricingRuleId?: string
    playerCount?: number
    groups?: Array<{ playerCount: number; pricingRuleId: string }>
    now: Date
  },
  deps: Repositories,
): Promise<Result<CheckInResult>> {
  const { staffId, pricingRuleId, playerCount = 1, groups, now } = input

  // ── Nếu có groups, resolve pricing groups trước (pre-tx) ──
  const resolvedGroupsResult = groups
    ? await resolveGroups(deps.pricing, groups, now)
    : null
  if (resolvedGroupsResult && !resolvedGroupsResult.ok) return resolvedGroupsResult
  const resolvedGroups = resolvedGroupsResult ? resolvedGroupsResult.value : null

  const totalPlayers = resolvedGroups
    ? resolvedGroups.reduce((sum, g) => sum + g.playerCount, 0)
    : playerCount

  // Session-level fields (backward compat) — nhóm đầu tiên hoặc snapshot chính
  let sessionLevel: Result<ResolvedSnapshot>
  if (resolvedGroups) {
    sessionLevel = ok(resolvedGroups[0])
  } else {
    sessionLevel = await resolvePricingSnapshot(deps.pricing, pricingRuleId, now)
  }
  if (!sessionLevel.ok) return sessionLevel

  const { pricingRuleId: resolvedId, pricingRuleSnapshot } = sessionLevel.value
  const applicableRate = resolvedGroups?.[0]?.pricingRuleSnapshot?.ratePerHour ?? pricingRuleSnapshot.ratePerHour

  const result = await runInTransaction(async (tx) => {
    // ── Dùng parseStartOfDay/parseEndOfDay để tính mốc ngày theo giờ Việt Nam (UTC+7) ──
    const todayStr = now.toISOString().slice(0, 10)
    const today = parseStartOfDay(todayStr)
    const tomorrow = parseEndOfDay(todayStr)
    // parseEndOfDay trả về 23:59:59.999 VN, cần +1ms để làm cận trên cho lt
    const tomorrowBoundary = new Date(tomorrow.getTime() + 1)

    const anonCount = await tx.customer.countWalkInsBetween(today, tomorrowBoundary)

    const anonCustomer = await tx.customer.create({
      fullName: `Khách #${String(anonCount + 1).padStart(3, '0')}`,
      type: 'WALK_IN',
    })

    const openShift = await tx.shift.findOpenForStaff(staffId)
    if (!openShift) fail('SHIFT_REQUIRED')

    const session = await tx.session.createWithRefs({
      customerId: anonCustomer.id,
      staffId,
      shiftId: openShift.id,
      startTime: now,
      hourlyRate: applicableRate,
      pricingRuleId: resolvedId,
      pricingRuleSnapshot,
      playerCount: totalPlayers,
    })

    // ── Luôn tạo pricing groups ──
    if (resolvedGroups) {
      let i = 1
      for (const g of resolvedGroups) {
        await tx.session.createPricingGroup({
          sessionId: session.id,
          label: `Nhóm ${i}`,
          playerCount: g.playerCount,
          remainingCount: g.playerCount,
          hourlyRate: g.pricingRuleSnapshot.ratePerHour,
          pricingRuleId: g.pricingRuleId,
          pricingSnapshot: g.pricingRuleSnapshot,
        })
        i += 1
      }
    } else {
      // Legacy path: single group
      await tx.session.createPricingGroup({
        sessionId: session.id,
        label: 'Nhóm 1',
        playerCount: totalPlayers,
        remainingCount: totalPlayers,
        hourlyRate: applicableRate,
        pricingRuleId: resolvedId,
        pricingSnapshot: pricingRuleSnapshot,
      })
    }

    await tx.audit.append({
      userId: staffId,
      action: 'SESSION_CHECK_IN',
      entityType: 'Session',
      entityId: session.id,
      details: {
        customerId: anonCustomer.id,
        customerType: 'WALK_IN',
        shiftId: openShift.id,
        hourlyRate: applicableRate,
        pricingRuleId: resolvedId,
        playerCount: totalPlayers,
        groupCount: resolvedGroups?.length ?? 1,
      },
    })

    return session
  })

  if (!result.ok) return result
  return ok({
    ...result.value,
    hourlyRate: Number(result.value.hourlyRate),
  } as CheckInResult)
}

async function checkInRegisteredCustomer(
  input: {
    staffId: string
    customerId: string
    pricingRuleId?: string
    playerCount?: number
    groups?: Array<{ playerCount: number; pricingRuleId: string }>
    now: Date
  },
  deps: Repositories,
): Promise<Result<CheckInResult>> {
  const { staffId, customerId, pricingRuleId, playerCount = 1, groups, now } = input

  // Validation trước transaction → return err
  const customer = await deps.customer.findById(customerId)
  if (!customer) return err('CUSTOMER_NOT_FOUND')

  const activeSession = await deps.session.findActiveByCustomer(customerId)
  if (activeSession) return err('ACTIVE_SESSION_EXISTS')

  let membershipId: string | undefined
  let resolvedPricingRuleId: string | undefined
  let pricingRuleSnapshot: PricingRuleSnapshot | undefined
  let totalPlayers = playerCount

  if (customer.type === 'MEMBER') {
    const activeMembership = await deps.membership.findActive(customer.id, now)
    if (!activeMembership) return err('MEMBERSHIP_REQUIRED')
    membershipId = activeMembership.id
  } else if (groups) {
    // Resolve tất cả group snapshots (pre-tx)
    const resolvedGroupsResult = await resolveGroups(deps.pricing, groups, now)
    if (!resolvedGroupsResult.ok) return resolvedGroupsResult
    const resolvedGroups = resolvedGroupsResult.value

    totalPlayers = resolvedGroups.reduce((sum, g) => sum + g.playerCount, 0)
    resolvedPricingRuleId = resolvedGroups[0].pricingRuleId
    pricingRuleSnapshot = resolvedGroups[0].pricingRuleSnapshot

    const result = await runInTransaction(async (tx) => {
      const openShift = await tx.shift.findOpenForStaff(staffId)
      if (!openShift) fail('SHIFT_REQUIRED')

      const session = await tx.session.createWithRefs({
        customerId: customer.id,
        staffId,
        shiftId: openShift.id,
        membershipId,
        startTime: now,
        hourlyRate: pricingRuleSnapshot!.ratePerHour,
        pricingRuleId: resolvedPricingRuleId,
        pricingRuleSnapshot,
        playerCount: totalPlayers,
      })

      let i = 1
      for (const g of resolvedGroups) {
        await tx.session.createPricingGroup({
          sessionId: session.id,
          label: `Nhóm ${i}`,
          playerCount: g.playerCount,
          remainingCount: g.playerCount,
          hourlyRate: g.pricingRuleSnapshot.ratePerHour,
          pricingRuleId: g.pricingRuleId,
          pricingSnapshot: g.pricingRuleSnapshot,
        })
        i += 1
      }

      await tx.audit.append({
        userId: staffId,
        action: 'SESSION_CHECK_IN',
        entityType: 'Session',
        entityId: session.id,
        details: {
          customerId: customer.id,
          customerType: customer.type,
          membershipId,
          shiftId: openShift.id,
          hourlyRate: pricingRuleSnapshot!.ratePerHour,
          pricingRuleId: resolvedPricingRuleId,
          playerCount: totalPlayers,
          groupCount: resolvedGroups.length,
        },
      })

      return session
    })

    if (!result.ok) return result
    return ok({
      ...result.value,
      hourlyRate: Number(result.value.hourlyRate),
    } as CheckInResult)
  } else {
    // Legacy single-pricing check-in
    const resolved = await resolvePricingSnapshot(deps.pricing, pricingRuleId, now)
    if (!resolved.ok) return resolved
    resolvedPricingRuleId = resolved.value.pricingRuleId
    pricingRuleSnapshot = resolved.value.pricingRuleSnapshot
  }

  const rate = membershipId ? 0 : (pricingRuleSnapshot?.ratePerHour ?? 0)

  const result = await runInTransaction(async (tx) => {
    const openShift = await tx.shift.findOpenForStaff(staffId)
    if (!openShift) fail('SHIFT_REQUIRED')

    const session = await tx.session.createWithRefs({
      customerId: customer.id,
      staffId,
      shiftId: openShift.id,
      membershipId,
      startTime: now,
      hourlyRate: rate,
      pricingRuleId: resolvedPricingRuleId,
      pricingRuleSnapshot,
      playerCount: totalPlayers,
    })

    // ── Luôn tạo 1 pricing group ──
    await tx.session.createPricingGroup({
      sessionId: session.id,
      label: 'Nhóm 1',
      playerCount: totalPlayers,
      remainingCount: totalPlayers,
      hourlyRate: rate,
      pricingRuleId: resolvedPricingRuleId,
      pricingSnapshot: pricingRuleSnapshot ?? null,
    })

    await tx.audit.append({
      userId: staffId,
      action: 'SESSION_CHECK_IN',
      entityType: 'Session',
      entityId: session.id,
      details: {
        customerId: customer.id,
        customerType: customer.type,
        membershipId,
        shiftId: openShift.id,
        hourlyRate: rate,
        pricingRuleId: resolvedPricingRuleId,
        playerCount: totalPlayers,
        groupCount: 1,
      },
    })

    return session
  })

  if (!result.ok) return result
  return ok({
    ...result.value,
    hourlyRate: Number(result.value.hourlyRate),
  } as CheckInResult)
}

export function mapCheckInError(error: DomainError): HttpErrorInfo {
  switch (error.code) {
    case 'CUSTOMER_NOT_FOUND':
      return { code: 'CUSTOMER_NOT_FOUND', message: 'Không tìm thấy khách hàng', status: 404 }
    case 'ACTIVE_SESSION_EXISTS':
      return { code: 'ACTIVE_SESSION_EXISTS', message: 'Khách đang có phiên chơi chưa kết thúc', status: 400 }
    case 'MEMBERSHIP_REQUIRED':
      return {
        code: 'MEMBERSHIP_REQUIRED',
        message: 'Hội viên chưa có gói còn hiệu lực. Vui lòng gia hạn trước khi check-in.',
        status: 409,
      }
    case 'PRICING_RULE_NOT_FOUND':
      return {
        code: 'PRICING_RULE_NOT_FOUND',
        message: 'Không có quy tắc bảng giá hiệu lực cho thời điểm hiện tại. Vui lòng cập nhật bảng giá trước khi check-in khách vãng lai.',
        status: 400,
      }
    case 'PRICING_RULE_NOT_EFFECTIVE':
      return {
        code: 'PRICING_RULE_NOT_EFFECTIVE',
        message: 'Bảng giá đã chọn không còn hiệu lực. Vui lòng chọn bảng giá khác.',
        status: 400,
      }
    case 'SHIFT_REQUIRED':
      return { code: 'SHIFT_REQUIRED', message: 'Cần mở hoặc tham gia ca trước khi check-in', status: 409 }
    default:
      return { code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 }
  }
}
