import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requireMutationAuth } from '@/lib/auth'
import { checkIn, mapCheckInError } from '@/lib/business/use-cases/checkIn'
import { prisma } from '@/lib/prisma'
import { createSessionSchema } from '@/lib/validations/session'

export async function GET(request: NextRequest) {
  try {
    await requireAuth()

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const customerId = searchParams.get('customerId')
    const date = searchParams.get('date')
    const page = clampPositiveInt(searchParams.get('page'), 1, 1, 500)
    const limit = clampPositiveInt(searchParams.get('limit'), 20, 1, 100)
    const skip = (page - 1) * limit

    const where: Record<string, unknown> = {}
    if (status) where.status = status
    if (customerId) where.customerId = customerId
    if (date) {
      const dayStart = new Date(date)
      const dayEnd = new Date(date)
      dayEnd.setDate(dayEnd.getDate() + 1)
      where.createdAt = { gte: dayStart, lt: dayEnd }
    }

    const [data, total] = await Promise.all([
      prisma.session.findMany({
        where,
        select: {
          id: true,
          startTime: true,
          endTime: true,
          status: true,
          hourlyRate: true,
          pricingRuleId: true,
          pricingRuleSnapshot: true,
          totalHours: true,
          subtotal: true,
          discountAmount: true,
          totalAmount: true,
          playerCount: true,
          promotionRuleId: true,
          promotionName: true,
          promotionDiscountType: true,
          promotionDiscountValue: true,
          customer: { select: { id: true, fullName: true, phone: true, type: true } },
          staff: { select: { id: true, fullName: true } },
          membership: { select: { id: true, startsAt: true, expiresAt: true } },
          shift: { select: { id: true, openedAt: true, status: true } },
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
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.session.count({ where }),
    ])

    // ── Tính tổng tiền bán kèm chưa thanh toán (DRAFT invoices) cho từng phiên ──
    const sessionIds = data.map((s) => s.id)
    const draftTotals: Record<string, number> = {}
    if (sessionIds.length > 0) {
      const drafts = await prisma.invoice.findMany({
        where: { sessionId: { in: sessionIds }, status: 'DRAFT' },
        select: { sessionId: true, grandTotal: true },
      })
      for (const d of drafts) {
        if (d.sessionId) {
          draftTotals[d.sessionId] = (draftTotals[d.sessionId] ?? 0) + Number(d.grandTotal)
        }
      }
    }

    const enriched = data.map((s) => ({
      ...s,
      pendingSellTotal: draftTotals[s.id] ?? 0,
    }))

    return NextResponse.json({
      success: true,
      data: enriched,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    })
  } catch (error) {
    if ((error as Error).message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 })
    }
    console.error('GET /api/sessions error:', error)
    return NextResponse.json({ success: false, error: 'Lỗi máy chủ' }, { status: 500 })
  }
}

function clampPositiveInt(
  value: string | null,
  fallback: number,
  min: number,
  max: number
): number {
  const parsed = Number.parseInt(value || '', 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireMutationAuth(request)

    const body = await request.json()
    const parsed = createSessionSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0].message },
        { status: 400 }
      )
    }

    const session = await checkIn({
      staffId: auth.userId,
      customerId: parsed.data.customerId,
      pricingRuleId: parsed.data.pricingRuleId,
      playerCount: parsed.data.playerCount,
      groups: parsed.data.groups,
    })

    return NextResponse.json({ success: true, data: session }, { status: 201 })
  } catch (error) {
    const message = (error as Error).message
    if (message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 })
    }
    if (message === 'CSRF_MISMATCH') {
      return NextResponse.json({ success: false, error: 'Yêu cầu không hợp lệ (CSRF)' }, { status: 403 })
    }
    console.error('POST /api/sessions error:', error)
    const mapped = mapCheckInError(error as Error)
    return NextResponse.json(
      { success: false, code: mapped.code, error: mapped.message },
      { status: mapped.status }
    )
  }
}
