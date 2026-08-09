import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/shared/auth'
import { validateCSRF } from '@/lib/shared/csrf'
import { derivePromotionDayType, normalizePromotionDays, createPromotionRule, mapCreatePromotionRuleError } from '@/lib/promotions'
import { repositories } from '@/lib/infrastructure/repositories'
import { parseLocalDate, parseLocalDateEnd } from '@/lib/shared/utils'
import { createPromotionRuleSchema } from '@/lib/promotions'
import {
  apiSuccess,
  apiError,
  resultToResponse,
  ERR_UNAUTHORIZED,
  ERR_FORBIDDEN,
  ERR_CSRF,
} from '@/lib/infrastructure/api-helpers'

export async function GET() {
  try {
    await requireAdmin()

    const rules = await repositories.promotions.findMany()

    return apiSuccess(rules)
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
      return apiError({ code: 'VALIDATION', message: parsed.error.issues[0].message, status: 400 })
    }

    const daysOfWeek = normalizePromotionDays(parsed.data.daysOfWeek)
    const effectiveFrom = parseLocalDate(parsed.data.effectiveFrom)
    const effectiveTo = parsed.data.effectiveTo ? parseLocalDateEnd(parsed.data.effectiveTo) : null
    const isActive = parsed.data.isActive ?? true

    const result = await createPromotionRule({
      staffId: auth.userId,
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
    })
    return resultToResponse(result, mapCreatePromotionRuleError, 201)
  } catch (error) {
    return promotionErrorResponse(error, 'POST /api/promotions error:')
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
