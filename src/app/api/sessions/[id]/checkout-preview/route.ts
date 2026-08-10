import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/shared/auth'
import { SETTING_KEYS } from '@/lib/settings'
import { calculatePlayerPrice, calculateSessionPrice, calculateSessionPriceFromLoaded, groupPausedSeconds, playerPausedSeconds } from '@/lib/sessions'
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

      let rawGroups: Array<{ playerCount: number; pricingRuleId: string }> | null = null
      if (groupsParam) {
        try {
          const parsedGroups = JSON.parse(groupsParam) as Array<{ playerCount: number; pricingRuleId: string }>
          if (Array.isArray(parsedGroups) && parsedGroups.length > 0) rawGroups = parsedGroups
        } catch { /* groups không hợp lệ → để null, fallback theo pricingRuleId/auto */ }
      }

      const resolved: Array<{ playerCount: number; pricingRuleId: string; snapshot: PricingRuleSnapshot }> = []
      if (rawGroups) {
        const totalPlayers = rawGroups.reduce((sum, g) => sum + g.playerCount, 0)
        if (totalPlayers !== session.playerCount) {
          return NextResponse.json(
            { success: false, error: 'Tổng số người trong các nhóm không khớp số người chơi của phiên' },
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
          resolved.push({ playerCount: g.playerCount, pricingRuleId: rule.id, snapshot: snapshotOf(rule) })
        }
      } else if (pricingRuleIdParam) {
        const rule = await repositories.pricing.findByIdWithTiers(pricingRuleIdParam)
        if (!rule) {
          return NextResponse.json({ success: false, error: 'Không tìm thấy bảng giá' }, { status: 409 })
        }
        if (!isEffective(rule)) {
          return NextResponse.json({ success: false, error: 'Bảng giá đã chọn không còn hiệu lực. Vui lòng chọn bảng giá khác.' }, { status: 409 })
        }
        resolved.push({ playerCount: session.playerCount, pricingRuleId: rule.id, snapshot: snapshotOf(rule) })
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
        resolved.push({ playerCount: session.playerCount, pricingRuleId: rule.id, snapshot: snapshotOf(rule) })
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

    // ── Tính tiền per-player (khớp logic checkout): mỗi người chưa thu của group
    // được tính played time riêng + tiered + khuyến mại, rồi cộng tổng.
    // Group không có player rows (legacy) → giữ kết quả pricing hiện tại.
    let perPlayerPricing = pricing
    if (hasPlayers && pricingGroupId) {
      const group = session.pricingGroups.find(g => g.id === pricingGroupId)
      const uncheckedPlayers = group ? group.players.filter(p => !p.checkedOutAt) : []
      // Thu N người đầu tiên theo thứ tự tạo (khớp use-case: slice(0, checkoutCount))
      const parsedPlayerCount = Number.parseInt(playerCountParam || '0', 10)
      const billCount = Number.isFinite(parsedPlayerCount) && parsedPlayerCount > 0
        ? Math.min(parsedPlayerCount, uncheckedPlayers.length)
        : uncheckedPlayers.length
      const playersToQuote = uncheckedPlayers.slice(0, billCount)
      if (playersToQuote.length > 0) {
        const totals = playersToQuote.reduce((acc, p) => {
          const r = calculatePlayerPrice({
            startTime: session.startTime,
            endTime,
            pausedSeconds: playerPausedSeconds(p, pausedAtRef),
            hourlyRate: pricing.hourlyRate,
            tiers: pricing.tiers,
            promotion,
          })
          return {
            totalHours: acc.totalHours + r.totalHours,
            subtotal: acc.subtotal + r.subtotal,
            promotionDiscount: acc.promotionDiscount + r.promotionDiscount,
            grandTotal: acc.grandTotal + r.grandTotal,
            pausedSeconds: acc.pausedSeconds + r.pausedSeconds,
          }
        }, { totalHours: 0, subtotal: 0, promotionDiscount: 0, grandTotal: 0, pausedSeconds: 0 })
        perPlayerPricing = { ...pricing, ...totals }
      }
    }

    // ── Lấy danh sách bán kèm chưa thanh toán (DRAFT invoices) ──
    const draftInvoices = await repositories.billing.findDraftSellPreview(id)

    let pendingSellTotal = 0
    const pendingSellItems: PlayTimeQuote['pendingSellItems'] = []
    for (const draft of draftInvoices) {
      pendingSellTotal += draft.grandTotal
      for (const item of draft.items) {
        pendingSellItems.push({
          productId: item.productId,
          productName: item.description,
          type: item.type as 'PRODUCT' | 'SERVICE',
          quantity: Number(item.quantity),
          unitPrice: Number(item.unitPrice),
          subtotal: Number(item.subtotal),
        })
      }
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
