import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/shared/auth'
import { SETTING_KEYS } from '@/lib/settings'
import { calculatePlayerPrice, calculateSessionPrice, calculateSessionPriceFromLoaded, groupPausedSeconds, playerPausedSeconds, sessionPauseSeconds } from '@/lib/sessions'
import type { PendingGroupPricing } from '@/lib/sessions'
import { repositories } from '@/lib/infrastructure/repositories'
import type { PlayTimeQuote, PricingRuleSnapshot } from '@/types'
import { getDayType, getVnDay, getVnHour } from '@/lib/shared/utils'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth()
    const { id } = await params
    const session = await repositories.session.findByIdWithPlayers(id)

    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Không tìm thấy phiên' },
        { status: 404 }
      )
    }
    if (session.status !== 'ACTIVE') {
      return NextResponse.json(
        { success: false, error: 'Chỉ có thể xem tạm tính cho phiên đang chơi' },
        { status: 400 }
      )
    }

    const promotionRuleId = _request.nextUrl.searchParams.get('promotionRuleId')
    const pricingGroupId = _request.nextUrl.searchParams.get('pricingGroupId')
    const endTimeParam = _request.nextUrl.searchParams.get('endTime')
    const pricingRuleIdParam = _request.nextUrl.searchParams.get('pricingRuleId')
    const groupsParam = _request.nextUrl.searchParams.get('groups')
    const pendingIndexParam = _request.nextUrl.searchParams.get('pendingIndex')
    // Số người sẽ thu lần này — preview tính per-player đúng N người (mặc định: toàn bộ người chưa thu)
    const playerCountParam = _request.nextUrl.searchParams.get('playerCount')
    // Thu trước: chọn người chơi cụ thể (bất kỳ nhóm nào) — JSON array playerIds
    const playerIdsParam = _request.nextUrl.searchParams.get('playerIds')

    const promotion = promotionRuleId
      ? await repositories.promotions.findAvailableById(promotionRuleId, new Date())
      : null

    if (promotionRuleId && !promotion) {
      return NextResponse.json(
        { success: false, error: 'Khuyến mại không còn hiệu lực để áp dụng' },
        { status: 409 }
      )
    }

    const endTime = endTimeParam ? new Date(endTimeParam) : new Date()
    const at = new Date()

    // ── Session khách vãng lai để trống giá lúc check-in → resolve bảng giá tạm tại checkout ──
    const isMemberSession = session.customer?.type === 'MEMBER' || !!session.membership
    const needsPricing = !isMemberSession
      && session.pricingGroups.length > 0
      && session.pricingGroups.every(g => !g.pricingSnapshot && Number(g.hourlyRate) === 0)

    let pendingGroups: PendingGroupPricing[] | undefined
    let pendingIndex = 0
    const resolved: Array<{ playerCount: number; pricingRuleId: string; playerIds: string[]; snapshot: PricingRuleSnapshot }> = []
    let rawGroups: Array<{ playerCount: number; pricingRuleId: string; playerIds: string[] }> | null = null
    if (needsPricing) {
      const snapshotOf = (rule: NonNullable<Awaited<ReturnType<typeof repositories.pricing.findByIdWithTiers>>>): PricingRuleSnapshot => ({
        ruleId: rule.id,
        name: rule.name,
        ratePerHour: Number(rule.ratePerHour),
        tiers: rule.tiers.map((t) => ({ minHours: t.minHours, ratePerHour: Number(t.ratePerHour) })),
      })
      const isEffective = (rule: NonNullable<Awaited<ReturnType<typeof repositories.pricing.findByIdWithTiers>>>): boolean => {
        const currentDay = getVnDay(at)
        const dayMatches = rule.daysOfWeek.length === 0 || rule.daysOfWeek.includes(currentDay)
        const effectiveFromOk = rule.effectiveFrom <= at
        const effectiveToOk = !rule.effectiveTo || rule.effectiveTo >= at
        return dayMatches && effectiveFromOk && effectiveToOk
      }

      if (groupsParam) {
        try {
          const parsedGroups = JSON.parse(groupsParam) as Array<{ playerCount: number; pricingRuleId: string; playerIds?: string[] }>
          if (Array.isArray(parsedGroups) && parsedGroups.length > 0) {
            rawGroups = parsedGroups.map((g) => ({ ...g, playerIds: g.playerIds ?? [] }))
          }
        } catch { /* groups không hợp lệ → để null, fallback theo pricingRuleId/auto */ }
      }

      if (rawGroups) {
        const totalPlayers = rawGroups.reduce((sum, g) => sum + g.playerCount, 0)
        // Thu trước (subset) cho phép totalPlayers < session.playerCount — chỉ chặn khi vượt quá
        if (totalPlayers > session.playerCount) {
          return NextResponse.json(
            { success: false, error: 'Tổng số người trong các nhóm vượt quá số người chơi của phiên' },
            { status: 400 }
          )
        }
        for (const g of rawGroups) {
          const rule = await repositories.pricing.findByIdWithTiers(g.pricingRuleId)
          if (!rule) {
            return NextResponse.json({ success: false, error: 'Không tìm thấy bảng giá' }, { status: 409 })
          }
          if (!isEffective(rule)) {
            return NextResponse.json({ success: false, error: 'Bảng giá đã chọn không còn hiệu lực. Vui lòng chọn bảng giá khác.' }, { status: 409 })
          }
          resolved.push({ playerCount: g.playerCount, pricingRuleId: rule.id, playerIds: g.playerIds, snapshot: snapshotOf(rule) })
        }
      } else if (pricingRuleIdParam) {
        const rule = await repositories.pricing.findByIdWithTiers(pricingRuleIdParam)
        if (!rule) {
          return NextResponse.json({ success: false, error: 'Không tìm thấy bảng giá' }, { status: 409 })
        }
        if (!isEffective(rule)) {
          return NextResponse.json({ success: false, error: 'Bảng giá đã chọn không còn hiệu lực. Vui lòng chọn bảng giá khác.' }, { status: 409 })
        }
        resolved.push({ playerCount: session.playerCount, pricingRuleId: rule.id, playerIds: [], snapshot: snapshotOf(rule) })
      } else {
        // Auto-resolve theo giờ checkout
        const currentHour = getVnHour(at)
        const dayType = getDayType(at)
        const rule = await repositories.pricing.findApplicableRule(currentHour, dayType, at)
        if (!rule) {
          return NextResponse.json(
            { success: false, error: 'Không tìm thấy bảng giá đã áp dụng cho phiên này' },
            { status: 409 }
          )
        }
        resolved.push({ playerCount: session.playerCount, pricingRuleId: rule.id, playerIds: [], snapshot: snapshotOf(rule) })
      }

      pendingGroups = resolved.map((r, i) => ({
        groupId: i === 0 ? session.pricingGroups[0]?.id : undefined,
        playerCount: r.playerCount,
        snapshot: r.snapshot,
      }))
      const parsedIndex = Number.parseInt(pendingIndexParam || '0', 10)
      pendingIndex = Number.isFinite(parsedIndex) ? parsedIndex : 0
    }

    // ── Tính pausedSeconds theo group được xem trước (fallback session-level) ──
    const pausedAtRef = endTime
    const hasPlayers = session.pricingGroups.some(g => g.players.length > 0)
    let pausedSeconds: number
    if (hasPlayers && pricingGroupId) {
      const group = session.pricingGroups.find(g => g.id === pricingGroupId)
      pausedSeconds = group ? groupPausedSeconds(group, pausedAtRef) : (session.totalPausedSeconds ?? 0)
    } else {
      pausedSeconds = session.totalPausedSeconds ?? 0
      if (session.pausedAt) {
        pausedSeconds += Math.round(Math.max(0, (pausedAtRef.getTime() - new Date(session.pausedAt).getTime())) / 1000)
      }
    }

    const pricingResult = needsPricing && pendingGroups
      ? await calculateSessionPriceFromLoaded(
          repositories,
          session,
          endTime,
          promotion,
          pricingGroupId ?? undefined,
          pendingGroups,
          pendingIndex,
          pausedSeconds
        )
      : await calculateSessionPrice(repositories, id, endTime, promotion, pricingGroupId ?? undefined, undefined, 0, pausedSeconds)

    if (!pricingResult.ok) {
      return pricingResult.error.code === 'PRICING_RULE_NOT_FOUND'
        ? NextResponse.json(
            { success: false, error: 'Không tìm thấy bảng giá đã áp dụng cho phiên này' },
            { status: 409 }
          )
        : NextResponse.json({ success: false, error: 'Lỗi máy chủ' }, { status: 500 })
    }
    const pricing = pricingResult.value
    if (pricing.membershipExpired) {
      return NextResponse.json(
        { success: false, error: 'Gói hội viên đã hết hạn. Vui lòng gia hạn trước khi thu tiền.' },
        { status: 409 }
      )
    }

    // ── Tính tiền per-player (khớp logic checkout): mỗi người chưa thu được tính
    // played time riêng + tiered + khuyến mại riêng, rồi cộng tổng.
    // - Nhiều bảng giá (groups): tất cả player chưa checkout, mỗi người rule của group nó.
    // - 1 group (pricingGroupId): player chưa checkout của group đó.
    // - Group không có player rows (legacy) → giữ kết quả pricing hiện tại.
    let perPlayerPricing = pricing
    let playerPricingDetail: PlayTimeQuote['playerPricing'] = undefined

    const groupRuleByName = (group: (typeof session.pricingGroups)[number]): { hourlyRate: number; tiers: { minHours: number; ratePerHour: number }[]; ruleName: string } => {
      // Ưu tiên snapshot đã persist; còn pendingGroups (bảng giá chọn tại checkout) theo groupId
      const snapshot = group.pricingSnapshot as unknown as PricingRuleSnapshot | null
      if (snapshot) {
        return {
          hourlyRate: snapshot.ratePerHour,
          tiers: snapshot.tiers.map((t) => ({ minHours: t.minHours, ratePerHour: t.ratePerHour })),
          ruleName: snapshot.name,
        }
      }
      const pending = pendingGroups?.find((pg) => pg.groupId === group.id)
      const pendingSnapshot = pending?.snapshot
      if (pendingSnapshot) {
        return {
          hourlyRate: pendingSnapshot.ratePerHour,
          tiers: pendingSnapshot.tiers.map((t) => ({ minHours: t.minHours, ratePerHour: t.ratePerHour })),
          ruleName: pendingSnapshot.name,
        }
      }
      return {
        hourlyRate: pricing.hourlyRate,
        tiers: pricing.tiers,
        ruleName: pricing.ruleName ?? '',
      }
    }

    if (hasPlayers) {
      // Nhiều bảng giá: player chọn tay theo playerIds (giữ thứ tự nhóm)
      let playersToQuote: Array<{ id: string; name: string | null; groupId: string; pausedAt: Date | null; totalPausedSeconds: number; checkedOutAt: Date | null }> = []
      // playerId → index nhóm (nhiều bảng giá)
      const playerToGroupIndex = new Map<string, number>()
      // Thu trước: chọn người chơi cụ thể ở bất kỳ nhóm nào
      let playerIds: string[] | null = null
      if (playerIdsParam) {
        try {
          const parsed = JSON.parse(playerIdsParam) as unknown
          if (Array.isArray(parsed)) playerIds = parsed.filter((x): x is string => typeof x === 'string')
        } catch { playerIds = null }
      }
      if (playerIds && playerIds.length > 0) {
        const allPlayers = session.pricingGroups.flatMap((g) => g.players)
        const selected = playerIds
          .map((pid) => allPlayers.find((p) => p.id === pid))
          .filter((p): p is NonNullable<typeof p> => !!p && !p.checkedOutAt)
        // playerToGroupIndex: owning-group index (dùng snapshot đã persist)
        session.pricingGroups.forEach((g, index) => {
          for (const p of g.players) {
            if (!p.checkedOutAt && selected.some((s) => s.id === p.id)) {
              playerToGroupIndex.set(p.id, index)
            }
          }
        })
        playersToQuote = selected
      } else if (groupsParam && pendingGroups && rawGroups && rawGroups.length > 0) {
        const allPlayers = session.pricingGroups.flatMap((g) => g.players)
        rawGroups.forEach((g, index) => {
          for (const pid of g.playerIds) playerToGroupIndex.set(pid, index)
        })
        const ids = rawGroups.flatMap((g) => g.playerIds)
        playersToQuote = ids
          .map((pid) => allPlayers.find((p) => p.id === pid))
          .filter((p): p is NonNullable<typeof p> => !!p)
      } else if (pricingGroupId) {
        const group = session.pricingGroups.find((g) => g.id === pricingGroupId)
        const uncheckedPlayers = group ? group.players.filter((p) => !p.checkedOutAt) : []
        // Thu N người đầu tiên theo thứ tự tạo (khớp use-case: slice(0, checkoutCount))
        const parsedPlayerCount = Number.parseInt(playerCountParam || '0', 10)
        const billCount = Number.isFinite(parsedPlayerCount) && parsedPlayerCount > 0
          ? Math.min(parsedPlayerCount, uncheckedPlayers.length)
          : uncheckedPlayers.length
        playersToQuote = uncheckedPlayers.slice(0, billCount)
      }

      if (playersToQuote.length > 0) {
        // Fallback session-level cho phiên 1 người cũ (pause toàn phiên chưa đồng bộ
        // xuống player): chỉ áp khi quote đúng 1 người và player chưa có pause nào.
        const quoteCount = playersToQuote.length
        const quoteFor = (p: typeof playersToQuote[number]) => {
          const groupIndex = playerToGroupIndex.get(p.id)
          // resolved chỉ được populate khi needsPricing (bảng giá chọn tại checkout).
          // Session đã gán giá + playerIds (thu trước) → resolved rỗng → fallback snapshot persist của group.
          const snapshot = groupIndex !== undefined && resolved[groupIndex]
            ? resolved[groupIndex].snapshot
            : undefined
          const rule = snapshot
            ? {
                hourlyRate: snapshot.ratePerHour,
                tiers: snapshot.tiers.map((t) => ({ minHours: t.minHours, ratePerHour: t.ratePerHour })),
                ruleName: snapshot.name,
              }
            : groupRuleByName(session.pricingGroups.find((g) => g.id === p.groupId) ?? session.pricingGroups[0])
          const playerSeconds = playerPausedSeconds(p, pausedAtRef)
          const pausedSeconds = quoteCount === 1 && playerSeconds === 0
            ? sessionPauseSeconds(session, pausedAtRef)
            : playerSeconds
          return {
            result: calculatePlayerPrice({
              startTime: session.startTime,
              endTime,
              pausedSeconds,
              hourlyRate: rule.hourlyRate,
              tiers: rule.tiers,
              promotion,
            }),
            ruleName: rule.ruleName,
          }
        }
        const totals = playersToQuote.reduce((acc, p) => {
          const { result } = quoteFor(p)
          return {
            totalHours: acc.totalHours + result.totalHours,
            subtotal: acc.subtotal + result.subtotal,
            promotionDiscount: acc.promotionDiscount + result.promotionDiscount,
            grandTotal: acc.grandTotal + result.grandTotal,
            pausedSeconds: acc.pausedSeconds + result.pausedSeconds,
          }
        }, { totalHours: 0, subtotal: 0, promotionDiscount: 0, grandTotal: 0, pausedSeconds: 0 })
        perPlayerPricing = { ...pricing, ...totals }

        // Chi tiết từng người — hiển thị tại checkout ("Người 1: 1.4h (Bảng giá) = 324.000đ")
        playerPricingDetail = playersToQuote.map((p) => {
          const { result, ruleName } = quoteFor(p)
          return {
            id: p.id,
            name: p.name ?? '',
            totalHours: result.totalHours,
            subtotal: result.subtotal,
            discountAmount: result.promotionDiscount,
            total: result.grandTotal,
            pricingRuleName: ruleName,
          }
        })
      }
    } else {
      // ── Legacy: session không có player rows → checkout nhân theo số người (khớp runCheckOutTx) ──
      const parsedPlayerCount = Number.parseInt(playerCountParam || '0', 10)
      const legacyCount = Number.isFinite(parsedPlayerCount) && parsedPlayerCount > 0
        ? parsedPlayerCount
        : pricingGroupId
          ? (session.pricingGroups.find((g) => g.id === pricingGroupId)?.remainingCount ?? session.playerCount)
          : (session.pricingGroups.find((g) => g.remainingCount > 0)?.remainingCount ?? session.playerCount)
      if (legacyCount > 0) {
        perPlayerPricing = {
          ...pricing,
          subtotal: pricing.subtotal * legacyCount,
          promotionDiscount: pricing.promotionDiscount * legacyCount,
          grandTotal: pricing.grandTotal * legacyCount,
          totalHours: pricing.totalHours * legacyCount,
        }
      }
    }

    // ── Lấy danh sách dòng bán kèm chưa thanh toán (SessionSellItem) ──
    const sellItems = await repositories.session.findSellItems(id)
    const sellProductIds = Array.from(new Set(sellItems.map((i) => i.productId)))
    const sellProducts = sellProductIds.length > 0
      ? await repositories.product.findManyByIds(sellProductIds)
      : []
    const sellProductById = new Map(sellProducts.map((p) => [p.id, p]))

    let pendingSellTotal = 0
    const pendingSellItems: PlayTimeQuote['pendingSellItems'] = []
    for (const item of sellItems) {
      const product = sellProductById.get(item.productId)
      pendingSellTotal += item.quantity * item.unitPrice
      pendingSellItems.push({
        productId: item.productId,
        productName: product?.name ?? 'Sản phẩm',
        type: product?.type ?? 'PRODUCT',
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        subtotal: item.quantity * item.unitPrice,
        sessionSellItemId: item.id,
      })
    }

    const quote: PlayTimeQuote = {
      sessionId: id,
      totalHours: perPlayerPricing.totalHours,
      hourlyRate: perPlayerPricing.hourlyRate,
      subtotal: perPlayerPricing.subtotal,
      discountAmount: perPlayerPricing.promotionDiscount,
      grandTotal: perPlayerPricing.grandTotal,
      isMemberSession: perPlayerPricing.isMemberSession,
      promotion: perPlayerPricing.promotion,
      pendingSellTotal,
      pendingSellItems,
      playerCount: session.playerCount,
      pricingGroupId: pricingGroupId ?? undefined,
      pausedSeconds,
      playerPricing: playerPricingDetail,
      pricingGroups: session.pricingGroups.map(g => ({
        id: g.id,
        sessionId: id,
        label: g.label,
        playerCount: g.playerCount,
        remainingCount: g.remainingCount,
        hourlyRate: Number(g.hourlyRate),
        pricingRuleId: g.pricingRuleId,
        pricingSnapshot: g.pricingSnapshot as unknown as PricingRuleSnapshot | null,
        pausedSeconds: g.players.length > 0 ? groupPausedSeconds(g, pausedAtRef) : undefined,
        players: g.players.length > 0 ? g.players.map(p => ({
          id: p.id,
          name: p.name,
          pausedAt: p.pausedAt ? p.pausedAt.toISOString() : null,
          totalPausedSeconds: p.totalPausedSeconds,
          checkedOutAt: p.checkedOutAt ? p.checkedOutAt.toISOString() : null,
          position: p.position,
        })) : undefined,
      })),
      parkingFeeUnitPrice: (await repositories.settings.getNumeric(SETTING_KEYS.PARKING_FEE_UNIT_PRICE, 0)) || undefined,
    }

    return NextResponse.json({ success: true, data: quote })
  } catch (error) {
    const message = (error as Error).message
    if (message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 })
    }
    if (message === 'PRICING_RULE_NOT_FOUND') {
      return NextResponse.json(
        { success: false, error: 'Không tìm thấy bảng giá đã áp dụng cho phiên này' },
        { status: 409 }
      )
    }

    console.error('GET /api/sessions/[id]/checkout-preview error:', error)
    return NextResponse.json({ success: false, error: 'Lỗi máy chủ' }, { status: 500 })
  }
}
