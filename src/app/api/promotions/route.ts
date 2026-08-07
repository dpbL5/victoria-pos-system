import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { validateCSRF } from '@/lib/csrf'
import { derivePromotionDayType, normalizePromotionDays } from '@/lib/promotions'
import { logActivity } from '@/lib/audit'
import { prisma } from '@/lib/prisma'
import { parseLocalDate, parseLocalDateEnd } from '@/lib/utils'
import { createPromotionRuleSchema } from '@/lib/promotions'

export async function GET() {
  try {
    await requireAdmin()

    const rules = await prisma.promotionRule.findMany({
      orderBy: [
        { isActive: 'desc' },
        { dayType: 'asc' },
        { hourFrom: 'asc' },
        { effectiveFrom: 'desc' },
      ],
    })

    return NextResponse.json({ success: true, data: rules })
  } catch (error) {
    return promotionErrorResponse(error, 'GET /api/promotions error:')
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin()
    await validateCSRF(request)
    const body = await request.json()
    const parsed = createPromotionRuleSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0].message },
        { status: 400 }
      )
    }

    const daysOfWeek = normalizePromotionDays(parsed.data.daysOfWeek)
    const effectiveFrom = parseLocalDate(parsed.data.effectiveFrom)
    const effectiveTo = parsed.data.effectiveTo ? parseLocalDateEnd(parsed.data.effectiveTo) : null
    const isActive = parsed.data.isActive ?? true

    const rule = await prisma.$transaction(async (tx) => {
      const created = await tx.promotionRule.create({
        data: {
          name: parsed.data.name,
          discountType: parsed.data.discountType,
          discountValue: parsed.data.discountValue,
          daysOfWeek,
          hourFrom: parsed.data.hourFrom,
          hourTo: parsed.data.hourTo ?? null,
          dayType: derivePromotionDayType(daysOfWeek),
          effectiveFrom,
          effectiveTo,
          isActive,
        },
      })

      await logActivity(tx, {
        userId: auth.userId,
        action: 'PROMOTION_RULE_CREATE',
        entityType: 'PromotionRule',
        entityId: created.id,
        details: promotionAuditDetails(created),
      })

      return created
    })

    return NextResponse.json({ success: true, data: rule }, { status: 201 })
  } catch (error) {
    return promotionErrorResponse(error, 'POST /api/promotions error:')
  }
}

function promotionAuditDetails(rule: {
  name: string
  discountType: string
  discountValue: { toString(): string } | number
  daysOfWeek: number[]
  hourFrom: number
  hourTo: number | null
  dayType: string
  effectiveFrom: Date
  effectiveTo: Date | null
  isActive: boolean
}) {
  return {
    name: rule.name,
    discountType: rule.discountType,
    discountValue: Number(rule.discountValue),
    daysOfWeek: rule.daysOfWeek,
    hourFrom: rule.hourFrom,
    hourTo: rule.hourTo,
    dayType: rule.dayType,
    effectiveFrom: rule.effectiveFrom.toISOString(),
    effectiveTo: rule.effectiveTo?.toISOString() ?? null,
    isActive: rule.isActive,
  }
}

function promotionErrorResponse(error: unknown, context: string) {
  const message = (error as Error).message
  if (message === 'UNAUTHORIZED') {
    return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 })
  }
  if (message === 'CSRF_MISMATCH') {
    return NextResponse.json({ success: false, error: 'Yêu cầu không hợp lệ (CSRF)' }, { status: 403 })
  }
  if (message === 'FORBIDDEN') {
    return NextResponse.json({ success: false, error: 'Không có quyền' }, { status: 403 })
  }

  console.error(context, error)
  return NextResponse.json({ success: false, error: 'Lỗi máy chủ' }, { status: 500 })
}
