import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/shared/auth'
import { validateCSRF } from '@/lib/shared/csrf'
import { createPricingRule, mapCreatePricingRuleError } from '@/lib/pricing'
import { repositories } from '@/lib/infrastructure/repositories'
import { parseLocalDate, parseLocalDateEnd } from '@/lib/shared/utils'
import { createPricingRuleSchema } from '@/lib/pricing'
import {
  apiSuccess,
  apiError,
  resultToResponse,
  ERR_UNAUTHORIZED,
  ERR_FORBIDDEN,
  ERR_CSRF,
} from '@/lib/infrastructure/api-helpers'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    await requireAdmin()

    const rules = await repositories.pricing.findManyWithTiers()

    return apiSuccess(rules)
  } catch (error) {
    const message = (error as Error).message
    if (message === 'UNAUTHORIZED') return apiError(ERR_UNAUTHORIZED)
    if (message === 'FORBIDDEN') return apiError(ERR_FORBIDDEN)
    console.error('GET /api/pricing error:', error)
    return apiError({ code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin()
    await validateCSRF(request)
    const body = await request.json()
    const parsed = createPricingRuleSchema.safeParse(body)

    if (!parsed.success) {
      return apiError({ code: 'VALIDATION', message: parsed.error.issues[0].message, status: 400 })
    }

    const effectiveFrom = parseLocalDate(parsed.data.effectiveFrom)
    const effectiveTo = parsed.data.effectiveTo ? parseLocalDateEnd(parsed.data.effectiveTo) : null
    const daysOfWeek = normalizeDaysOfWeek(parsed.data.daysOfWeek)
    const dayType = deriveDayTypeFromDays(daysOfWeek)

    const result = await createPricingRule({
      staffId: auth.userId,
      name: parsed.data.name,
      hourFrom: parsed.data.hourFrom,
      hourTo: parsed.data.hourTo ?? null,
      ratePerHour: parsed.data.ratePerHour,
      daysOfWeek,
      dayType,
      effectiveFrom,
      effectiveTo,
      tiers: parsed.data.tiers,
    })

    if (!result.ok) return apiError(mapCreatePricingRuleError(result.error))

    const { rule, warnings } = result.value
    return NextResponse.json(
      {
        success: true,
        data: rule,
        ...(warnings.length > 0 ? { warnings } : {}),
      },
      { status: 201 }
    )
  } catch (error) {
    const message = (error as Error).message
    if (message === 'UNAUTHORIZED') return apiError(ERR_UNAUTHORIZED)
    if (message === 'CSRF_MISMATCH') return apiError(ERR_CSRF)
    if (message === 'FORBIDDEN') return apiError(ERR_FORBIDDEN)
    console.error('POST /api/pricing error:', error)
    return apiError({ code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 })
  }
}

// Re-export normalize helpers used in route (giữ nguyên import pattern cũ)
import { deriveDayTypeFromDays, normalizeDaysOfWeek } from '@/lib/pricing'
