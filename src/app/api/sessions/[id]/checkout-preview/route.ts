import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/shared/auth'
import { SETTING_KEYS } from '@/lib/settings'
import { calculateSessionPrice, calculateSessionPriceFromLoaded } from '@/lib/sessions'
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
    const session = await repositories.session.findByIdForCheckout(id)

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

    const pricingResult = needsPricing && pendingGroups
      ? await calculateSessionPriceFromLoaded(
          repositories,
          session,
          endTime,
          promotion,
          pricingGroupId ?? undefined,
          pendingGroups,
          pendingIndex
        )
      : await calculateSessionPrice(repositories, id, endTime, promotion, pricingGroupId ?? undefined)

    if (!pricingResult.ok) {
      return pricingResult.error.code === 'PRICING_RULE_NOT_FOUND'
        ? NextResponse.json(
            { success: false, error: 'Không tìm thấy bảng giá đã áp dụng cho phiên này' },
            { status: 409 }
          )
        : NextResponse.json({ success: false, error: 'Lỗi máy chủ' }, { status: 500 })
    }
    const pricing = pricingResult.value

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
      totalHours: pricing.totalHours,
      hourlyRate: pricing.hourlyRate,
      subtotal: pricing.subtotal,
      discountAmount: pricing.promotionDiscount,
      grandTotal: pricing.grandTotal,
      isMemberSession: pricing.isMemberSession,
      promotion: pricing.promotion,
      pendingSellTotal,
      pendingSellItems,
      playerCount: session.playerCount,
      pricingGroupId: pricingGroupId ?? undefined,
      pricingGroups: session.pricingGroups.map(g => ({
        id: g.id,
        sessionId: id,
        label: g.label,
        playerCount: g.playerCount,
        remainingCount: g.remainingCount,
        hourlyRate: Number(g.hourlyRate),
        pricingRuleId: g.pricingRuleId,
        pricingSnapshot: g.pricingSnapshot as unknown as PricingRuleSnapshot | null,
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
