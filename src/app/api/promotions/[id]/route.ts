import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { validateCSRF } from '@/lib/csrf'
import {
  derivePromotionDayType,
  normalizePromotionDays,
  resolvePromotionDays,
} from '@/lib/business/promotions'
import { logActivity } from '@/lib/business/audit'
import { prisma } from '@/lib/prisma'
import { parseLocalDate, parseLocalDateEnd, toInputDate } from '@/lib/utils'
import {
  createPromotionRuleSchema,
  updatePromotionRuleSchema,
} from '@/lib/validations/promotion'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin()
    await validateCSRF(request)
    const { id } = await params
    const body = await request.json()
    const parsed = updatePromotionRuleSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0].message },
        { status: 400 }
      )
    }

    const existing = await prisma.promotionRule.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Không tìm thấy khuyến mại' },
        { status: 404 }
      )
    }

    const daysOfWeek = parsed.data.daysOfWeek !== undefined
      ? normalizePromotionDays(parsed.data.daysOfWeek)
      : resolvePromotionDays(existing.daysOfWeek, existing.dayType)
    const candidate = {
      name: parsed.data.name ?? existing.name,
      discountType: parsed.data.discountType ?? existing.discountType,
      discountValue: parsed.data.discountValue ?? Number(existing.discountValue),
      daysOfWeek,
      hourFrom: parsed.data.hourFrom ?? existing.hourFrom,
      hourTo: parsed.data.hourTo !== undefined ? parsed.data.hourTo : existing.hourTo,
      effectiveFrom: parsed.data.effectiveFrom ?? toInputDate(existing.effectiveFrom),
      effectiveTo: parsed.data.effectiveTo !== undefined
        ? parsed.data.effectiveTo
        : (existing.effectiveTo ? toInputDate(existing.effectiveTo) : null),
      isActive: parsed.data.isActive ?? existing.isActive,
    }
    const complete = createPromotionRuleSchema.safeParse(candidate)

    if (!complete.success) {
      return NextResponse.json(
        { success: false, error: complete.error.issues[0].message },
        { status: 400 }
      )
    }

    const effectiveFrom = parseLocalDate(complete.data.effectiveFrom)
    const effectiveTo = complete.data.effectiveTo ? parseLocalDateEnd(complete.data.effectiveTo) : null

    const updated = await prisma.$transaction(async (tx) => {
      const rule = await tx.promotionRule.update({
        where: { id },
        data: {
          name: complete.data.name,
          discountType: complete.data.discountType,
          discountValue: complete.data.discountValue,
          daysOfWeek,
          hourFrom: complete.data.hourFrom,
          hourTo: complete.data.hourTo ?? null,
          dayType: derivePromotionDayType(daysOfWeek),
          effectiveFrom,
          effectiveTo,
          isActive: complete.data.isActive ?? true,
        },
      })

      await logActivity(tx, {
        userId: auth.userId,
        action: 'PROMOTION_RULE_UPDATE',
        entityType: 'PromotionRule',
        entityId: id,
        details: {
          before: promotionAuditDetails(existing),
          after: promotionAuditDetails(rule),
        },
      })

      return rule
    })

    return NextResponse.json({ success: true, data: updated })
  } catch (error) {
    return promotionErrorResponse(error, 'PUT /api/promotions/[id] error:')
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin()
    await validateCSRF(request)
    const { id } = await params
    const existing = await prisma.promotionRule.findUnique({ where: { id } })

    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Không tìm thấy khuyến mại' },
        { status: 404 }
      )
    }

    await prisma.$transaction(async (tx) => {
      await tx.promotionRule.delete({ where: { id } })

      await logActivity(tx, {
        userId: auth.userId,
        action: 'PROMOTION_RULE_DELETE',
        entityType: 'PromotionRule',
        entityId: id,
        details: {
          before: promotionAuditDetails(existing),
        },
      })
    })

    return NextResponse.json({ success: true, message: 'Đã xoá khuyến mại' })
  } catch (error) {
    return promotionErrorResponse(error, 'DELETE /api/promotions/[id] error:')
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
