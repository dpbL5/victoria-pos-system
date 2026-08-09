import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/shared/auth'
import { validateCSRF } from '@/lib/shared/csrf'
import { derivePromotionDayType, normalizePromotionDays, resolvePromotionDays, updatePromotionRule, mapUpdatePromotionRuleError, deletePromotionRule, mapDeletePromotionRuleError } from '@/lib/promotions'
import { repositories } from '@/lib/infrastructure/repositories'
import { parseLocalDate, parseLocalDateEnd, toInputDate } from '@/lib/shared/utils'
import {
  createPromotionRuleSchema,
  updatePromotionRuleSchema,
} from '@/lib/promotions'
import {
  apiError,
  apiSuccess,
  resultToResponse,
  ERR_UNAUTHORIZED,
  ERR_FORBIDDEN,
  ERR_CSRF,
} from '@/lib/infrastructure/api-helpers'

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
      return apiError({ code: 'VALIDATION', message: parsed.error.issues[0].message, status: 400 })
    }

    const existing = await repositories.promotions.findById(id)
    if (!existing) {
      return apiError({ code: 'PROMOTION_NOT_FOUND', message: 'Không tìm thấy khuyến mại', status: 404 })
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
      return apiError({ code: 'VALIDATION', message: complete.error.issues[0].message, status: 400 })
    }

    const effectiveFrom = parseLocalDate(complete.data.effectiveFrom)
    const effectiveTo = complete.data.effectiveTo ? parseLocalDateEnd(complete.data.effectiveTo) : null

    const result = await updatePromotionRule({
      staffId: auth.userId,
      ruleId: id,
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
    return resultToResponse(result, mapUpdatePromotionRuleError)
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

    const result = await deletePromotionRule({ staffId: auth.userId, ruleId: id })
    if (!result.ok) return apiError(mapDeletePromotionRuleError(result.error))

    return apiSuccess({ message: 'Đã xoá khuyến mại' })
  } catch (error) {
    return promotionErrorResponse(error, 'DELETE /api/promotions/[id] error:')
  }
}

function promotionErrorResponse(error: unknown, context: string) {
  const message = (error as Error).message
  if (message === 'UNAUTHORIZED') return apiError(ERR_UNAUTHORIZED)
  if (message === 'CSRF_MISMATCH') return apiError(ERR_CSRF)
  if (message === 'FORBIDDEN') return apiError(ERR_FORBIDDEN)

  console.error(context, error)
  return apiError({ code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 })
}
