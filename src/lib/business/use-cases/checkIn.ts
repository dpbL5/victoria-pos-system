import { logActivity } from '@/lib/business/audit'
import { findActiveMembership } from '@/lib/business/memberships'
import { findOpenShiftForStaff } from '@/lib/business/shifts'
import { prisma } from '@/lib/prisma'
import { findApplicableRate, findApplicablePricingRule, fetchPricingRuleForSnapshot } from '@/lib/pricing'
import { getDayType, getVnHour, getVnDay, parseStartOfDay, parseEndOfDay } from '@/lib/utils'
import type { PricingRuleSnapshot } from '@/types'

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

async function resolvePricingSnapshot(
  pricingRuleId: string | undefined,
  now: Date,
): Promise<{ pricingRuleId: string; pricingRuleSnapshot: PricingRuleSnapshot }> {
  if (pricingRuleId) {
    const rule = await fetchPricingRuleForSnapshot(pricingRuleId)
    if (!rule) throw new Error('PRICING_RULE_NOT_FOUND')

    // Kiểm tra bảng giá còn hiệu lực ở thời điểm check-in
    const currentDay = getVnDay(now)
    const dayMatches =
      rule.daysOfWeek.length === 0 || rule.daysOfWeek.includes(currentDay)
    const effectiveFromOk = rule.effectiveFrom <= now
    const effectiveToOk = !rule.effectiveTo || rule.effectiveTo >= now

    if (!dayMatches || !effectiveFromOk || !effectiveToOk) {
      throw new Error('PRICING_RULE_NOT_EFFECTIVE')
    }

    return {
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
    }
  }

  // Auto-resolve: tìm bảng giá phù hợp nhất theo giờ/ngày hiện tại
  const currentHour = getVnHour(now)
  const dayType = getDayType(now)
  const rule = await findApplicablePricingRule(currentHour, dayType, now)
  if (!rule) throw new Error('PRICING_RULE_NOT_FOUND')

  // Fetch tiers cho rule được auto-resolve
  const tiers = await prisma.pricingTier.findMany({
    where: { ruleId: rule.id },
    orderBy: { minHours: 'asc' },
  })

  return {
    pricingRuleId: rule.id,
    pricingRuleSnapshot: {
      ruleId: rule.id,
      name: rule.name,
      ratePerHour: Number(rule.ratePerHour),
      tiers: tiers.map((t) => ({
        minHours: t.minHours,
        ratePerHour: Number(t.ratePerHour),
      })),
    },
  }
}

async function createPricingGroups(
  tx: typeof prisma,
  sessionId: string,
  groups: Array<{ playerCount: number; pricingRuleId: string }>,
  now: Date,
): Promise<void> {
  let i = 1
  for (const group of groups) {
    const { pricingRuleId, pricingRuleSnapshot } = await resolvePricingSnapshot(group.pricingRuleId, now)
    await tx.sessionPricingGroup.create({
      data: {
        sessionId,
        label: `Nhóm ${i}`,
        playerCount: group.playerCount,
        remainingCount: group.playerCount,
        hourlyRate: pricingRuleSnapshot.ratePerHour,
        pricingRuleId,
        pricingSnapshot: pricingRuleSnapshot as any,
      },
    })
    i++
  }
}

export async function checkIn({
  staffId,
  customerId,
  pricingRuleId,
  playerCount = 1,
  groups,
  now = new Date(),
}: CheckInInput): Promise<CheckInResult> {
  if (!customerId) {
    return checkInAnonymousWalkIn({ staffId, pricingRuleId, playerCount, groups, now })
  }

  return checkInRegisteredCustomer({ staffId, customerId, pricingRuleId, playerCount, groups, now })
}

async function checkInAnonymousWalkIn({
  staffId,
  pricingRuleId,
  playerCount = 1,
  groups,
  now,
}: {
  staffId: string
  pricingRuleId?: string
  playerCount?: number
  groups?: Array<{ playerCount: number; pricingRuleId: string }>
  now: Date
}) {
  // ── Nếu có groups, resolve pricing groups trước ──
  const resolvedGroups = groups
    ? await Promise.all(
        groups.map(async (g) => {
          const resolved = await resolvePricingSnapshot(g.pricingRuleId, now)
          return { ...g, ...resolved }
        })
      )
    : null

  const totalPlayers = resolvedGroups
    ? resolvedGroups.reduce((sum, g) => sum + g.playerCount, 0)
    : playerCount

  const { pricingRuleId: resolvedId, pricingRuleSnapshot } = resolvedGroups
    ? resolvedGroups[0] // first group for session-level fields (backward compat)
    : await resolvePricingSnapshot(pricingRuleId, now)

  const applicableRate = resolvedGroups?.[0]?.pricingRuleSnapshot?.ratePerHour ?? pricingRuleSnapshot.ratePerHour

  const result = await prisma.$transaction(async (tx) => {
    // ── Dùng parseStartOfDay/parseEndOfDay để tính mốc ngày theo giờ Việt Nam (UTC+7) ──
    const todayStr = now.toISOString().slice(0, 10)
    const today = parseStartOfDay(todayStr)
    const tomorrow = parseEndOfDay(todayStr)
    // parseEndOfDay trả về 23:59:59.999 VN, cần +1ms để làm cận trên cho lt
    const tomorrowBoundary = new Date(tomorrow.getTime() + 1)

    const anonCount = await tx.customer.count({
      where: {
        type: 'WALK_IN',
        phone: null,
        createdAt: { gte: today, lt: tomorrowBoundary },
      },
    })

    const anonCustomer = await tx.customer.create({
      data: {
        fullName: `Khách #${String(anonCount + 1).padStart(3, '0')}`,
        type: 'WALK_IN',
      },
    })

    const openShift = await findOpenShiftForStaff(tx, staffId)
    if (!openShift) {
      throw new Error('SHIFT_REQUIRED')
    }

    const session = await tx.session.create({
      data: {
        customerId: anonCustomer.id,
        staffId,
        shiftId: openShift.id,
        startTime: now,
        hourlyRate: applicableRate,
        pricingRuleId: resolvedId,
        pricingRuleSnapshot: pricingRuleSnapshot as any,
        playerCount: totalPlayers,
        status: 'ACTIVE',
      },
      include: {
        customer: { select: { id: true, fullName: true, type: true } },
        membership: { select: { id: true, startsAt: true, expiresAt: true } },
        shift: { select: { id: true, openedAt: true, status: true } },
      },
    })

    // ── Luôn tạo pricing groups ──
    if (resolvedGroups) {
      let i = 1
      for (const g of resolvedGroups) {
        await tx.sessionPricingGroup.create({
          data: {
            sessionId: session.id,
            label: `Nhóm ${i}`,
            playerCount: g.playerCount,
            remainingCount: g.playerCount,
            hourlyRate: g.pricingRuleSnapshot.ratePerHour,
            pricingRuleId: g.pricingRuleId,
            pricingSnapshot: g.pricingRuleSnapshot as any,
          },
        })
        i++
      }
    } else {
      // Legacy path: single group
      await tx.sessionPricingGroup.create({
        data: {
          sessionId: session.id,
          label: 'Nhóm 1',
          playerCount: totalPlayers,
          remainingCount: totalPlayers,
          hourlyRate: applicableRate,
          pricingRuleId: resolvedId,
          pricingSnapshot: pricingRuleSnapshot as any,
        },
      })
    }

    await logActivity(tx, {
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

  return {
    ...result,
    hourlyRate: Number(result.hourlyRate),
  } as CheckInResult
}

async function checkInRegisteredCustomer({
  staffId,
  customerId,
  pricingRuleId,
  playerCount = 1,
  groups,
  now,
}: {
  staffId: string
  customerId: string
  pricingRuleId?: string
  playerCount?: number
  groups?: Array<{ playerCount: number; pricingRuleId: string }>
  now: Date
}) {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
  })
  if (!customer) {
    throw new Error('CUSTOMER_NOT_FOUND')
  }

  const activeSession = await prisma.session.findFirst({
    where: { customerId, status: 'ACTIVE' },
  })
  if (activeSession) {
    throw new Error('ACTIVE_SESSION_EXISTS')
  }

  let membershipId: string | undefined
  let resolvedPricingRuleId: string | undefined
  let pricingRuleSnapshot: PricingRuleSnapshot | undefined
  let totalPlayers = playerCount

  if (customer.type === 'MEMBER') {
    const activeMembership = await findActiveMembership(prisma, customer.id, now)
    if (!activeMembership) {
      throw new Error('MEMBERSHIP_REQUIRED')
    }
    membershipId = activeMembership.id
  } else if (groups) {
    // Resolve all group snapshots
    const resolvedGroups = await Promise.all(
      groups.map(async (g) => {
        const resolved = await resolvePricingSnapshot(g.pricingRuleId, now)
        return { ...g, ...resolved }
      })
    )
    totalPlayers = resolvedGroups.reduce((sum, g) => sum + g.playerCount, 0)
    resolvedPricingRuleId = resolvedGroups[0].pricingRuleId
    pricingRuleSnapshot = resolvedGroups[0].pricingRuleSnapshot

    const result = await prisma.$transaction(async (tx) => {
      const openShift = await findOpenShiftForStaff(tx, staffId)
      if (!openShift) {
        throw new Error('SHIFT_REQUIRED')
      }

      const session = await tx.session.create({
        data: {
          customerId: customer.id,
          staffId,
          shiftId: openShift.id,
          membershipId,
          startTime: now,
          hourlyRate: pricingRuleSnapshot!.ratePerHour,
          pricingRuleId: resolvedPricingRuleId,
          pricingRuleSnapshot: pricingRuleSnapshot as any,
          playerCount: totalPlayers,
          status: 'ACTIVE',
        },
        include: {
          customer: { select: { id: true, fullName: true, type: true } },
          membership: { select: { id: true, startsAt: true, expiresAt: true } },
          shift: { select: { id: true, openedAt: true, status: true } },
        },
      })

      let i = 1
      for (const g of resolvedGroups) {
        await tx.sessionPricingGroup.create({
          data: {
            sessionId: session.id,
            label: `Nhóm ${i}`,
            playerCount: g.playerCount,
            remainingCount: g.playerCount,
            hourlyRate: g.pricingRuleSnapshot.ratePerHour,
            pricingRuleId: g.pricingRuleId,
            pricingSnapshot: g.pricingRuleSnapshot as any,
          },
        })
        i++
      }

      await logActivity(tx, {
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

    return {
      ...result,
      hourlyRate: Number(result.hourlyRate),
    } as CheckInResult
  } else {
    // Legacy single-pricing check-in
    const resolved = await resolvePricingSnapshot(pricingRuleId, now)
    resolvedPricingRuleId = resolved.pricingRuleId
    pricingRuleSnapshot = resolved.pricingRuleSnapshot
  }

  const rate = membershipId ? 0 : (pricingRuleSnapshot?.ratePerHour ?? 0)

  const result = await prisma.$transaction(async (tx) => {
    const openShift = await findOpenShiftForStaff(tx, staffId)
    if (!openShift) {
      throw new Error('SHIFT_REQUIRED')
    }

    const session = await tx.session.create({
      data: {
        customerId: customer.id,
        staffId,
        shiftId: openShift.id,
        membershipId,
        startTime: now,
        hourlyRate: rate,
        pricingRuleId: resolvedPricingRuleId,
        pricingRuleSnapshot: pricingRuleSnapshot as any,
        playerCount: totalPlayers,
        status: 'ACTIVE',
      },
      include: {
        customer: { select: { id: true, fullName: true, type: true } },
        membership: { select: { id: true, startsAt: true, expiresAt: true } },
        shift: { select: { id: true, openedAt: true, status: true } },
      },
    })

    // ── Luôn tạo 1 pricing group ──
    await tx.sessionPricingGroup.create({
      data: {
        sessionId: session.id,
        label: 'Nhóm 1',
        playerCount: totalPlayers,
        remainingCount: totalPlayers,
        hourlyRate: rate,
        pricingRuleId: resolvedPricingRuleId,
        pricingSnapshot: pricingRuleSnapshot as any,
      },
    })

    await logActivity(tx, {
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

  return {
    ...result,
    hourlyRate: Number(result.hourlyRate),
  } as CheckInResult
}

export function mapCheckInError(error: Error): { code: string; message: string; status: number } {
  const message = error.message

  if (message === 'CUSTOMER_NOT_FOUND') {
    return { code: 'CUSTOMER_NOT_FOUND', message: 'Không tìm thấy khách hàng', status: 404 }
  }
  if (message === 'ACTIVE_SESSION_EXISTS') {
    return { code: 'ACTIVE_SESSION_EXISTS', message: 'Khách đang có phiên chơi chưa kết thúc', status: 400 }
  }
  if (message === 'MEMBERSHIP_REQUIRED') {
    return {
      code: 'MEMBERSHIP_REQUIRED',
      message: 'Hội viên chưa có gói còn hiệu lực. Vui lòng gia hạn trước khi check-in.',
      status: 409,
    }
  }
  if (message === 'PRICING_RULE_NOT_FOUND') {
    return {
      code: 'PRICING_RULE_NOT_FOUND',
      message: 'Không có quy tắc bảng giá hiệu lực cho thời điểm hiện tại. Vui lòng cập nhật bảng giá trước khi check-in khách vãng lai.',
      status: 400,
    }
  }
  if (message === 'PRICING_RULE_NOT_EFFECTIVE') {
    return {
      code: 'PRICING_RULE_NOT_EFFECTIVE',
      message: 'Bảng giá đã chọn không còn hiệu lực. Vui lòng chọn bảng giá khác.',
      status: 400,
    }
  }
  if (message === 'SHIFT_REQUIRED') {
    return { code: 'SHIFT_REQUIRED', message: 'Cần mở hoặc tham gia ca trước khi check-in', status: 409 }
  }

  return { code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 }
}
