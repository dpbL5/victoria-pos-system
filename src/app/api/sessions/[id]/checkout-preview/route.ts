import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { findAvailablePromotionById } from '@/lib/business/promotions'
import { getNumericSetting, SETTING_KEYS } from '@/lib/business/settings'
import { calculateSessionPrice } from '@/lib/pricing'
import { prisma } from '@/lib/prisma'
import type { PlayTimeQuote, SessionPricingGroupDTO } from '@/types'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth()
    const { id } = await params
    const session = await prisma.session.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        playerCount: true,
        pricingGroups: {
          select: {
            id: true,
            label: true,
            playerCount: true,
            remainingCount: true,
            hourlyRate: true,
            pricingRuleId: true,
            pricingSnapshot: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    })

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

    const promotion = promotionRuleId
      ? await findAvailablePromotionById(promotionRuleId)
      : null

    if (promotionRuleId && !promotion) {
      return NextResponse.json(
        { success: false, error: 'Khuyến mại không còn hiệu lực để áp dụng' },
        { status: 409 }
      )
    }

    const endTime = endTimeParam ? new Date(endTimeParam) : new Date()
    const pricing = await calculateSessionPrice(id, endTime, promotion, pricingGroupId ?? undefined)

    // ── Lấy danh sách bán kèm chưa thanh toán (DRAFT invoices) ──
    const draftInvoices = await prisma.invoice.findMany({
      where: { sessionId: id, status: 'DRAFT' },
      include: {
        items: {
          where: { productId: { not: null } },
          select: {
            productId: true,
            description: true,
            type: true,
            quantity: true,
            unitPrice: true,
            subtotal: true,
          },
        },
      },
    })

    let pendingSellTotal = 0
    const pendingSellItems: PlayTimeQuote['pendingSellItems'] = []
    for (const draft of draftInvoices) {
      pendingSellTotal += Number(draft.grandTotal)
      for (const item of draft.items) {
        pendingSellItems.push({
          productId: item.productId!,
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
        pricingSnapshot: g.pricingSnapshot as any,
      })),
      parkingFeeUnitPrice: (await getNumericSetting(SETTING_KEYS.PARKING_FEE_UNIT_PRICE, 0)) || undefined,
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
