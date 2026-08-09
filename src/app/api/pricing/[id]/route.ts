import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/shared/auth'
import { validateCSRF } from '@/lib/shared/csrf'
import {
  updatePricingRule,
  mapUpdatePricingRuleError,
  deletePricingRule,
  mapDeletePricingRuleError,
} from '@/lib/pricing'
import { repositories } from '@/lib/infrastructure/repositories'
import { parseLocalDate, parseLocalDateEnd } from '@/lib/shared/utils'
import { updatePricingRuleSchema } from '@/lib/pricing'
import {
  apiError,
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
    const parsed = updatePricingRuleSchema.safeParse(body)

    if (!parsed.success) {
      return apiError({ code: 'VALIDATION', message: parsed.error.issues[0].message, status: 400 })
    }

    const existing = await repositories.pricing.findById(id)
    if (!existing) {
      return apiError({ code: 'PRICING_RULE_NOT_FOUND', message: 'Không tìm thấy quy tắc bảng giá', status: 404 })
    }

    const legacyDayType = parsed.data.dayType ?? existing.dayType
    const daysOfWeek = parsed.data.daysOfWeek !== undefined
      ? normalizeDaysOfWeek(parsed.data.daysOfWeek)
      : resolveRuleDaysOfWeek(existing.daysOfWeek, legacyDayType)
    const dayType = parsed.data.daysOfWeek !== undefined
      ? deriveDayTypeFromDays(daysOfWeek)
      : legacyDayType
    const hourFrom = parsed.data.hourFrom ?? existing.hourFrom
    const hourTo = parsed.data.hourTo !== undefined ? parsed.data.hourTo : existing.hourTo
    const effectiveFrom = parsed.data.effectiveFrom
      ? parseLocalDate(parsed.data.effectiveFrom)
      : existing.effectiveFrom
    const effectiveTo = parsed.data.effectiveTo !== undefined
      ? (parsed.data.effectiveTo ? parseLocalDateEnd(parsed.data.effectiveTo) : null)
      : existing.effectiveTo

    const result = await updatePricingRule({
      staffId: auth.userId,
      ruleId: id,
      name: parsed.data.name,
      hourFrom,
      hourTo,
      ratePerHour: parsed.data.ratePerHour,
      daysOfWeek: parsed.data.daysOfWeek !== undefined ? daysOfWeek : undefined,
      dayType: parsed.data.daysOfWeek !== undefined ? dayType : undefined,
      effectiveFrom: parsed.data.effectiveFrom ? effectiveFrom : undefined,
      effectiveTo: parsed.data.effectiveTo !== undefined ? effectiveTo : undefined,
      tiers: parsed.data.tiers,
    })

    if (!result.ok) return apiError(mapUpdatePricingRuleError(result.error))

    const { rule, warnings } = result.value
    return NextResponse.json(
      {
        success: true,
        data: rule,
        ...(warnings.length > 0 ? { warnings } : {}),
      }
    )
  } catch (error) {
    const message = (error as Error).message
    if (message === 'UNAUTHORIZED') return apiError(ERR_UNAUTHORIZED)
    if (message === 'CSRF_MISMATCH') return apiError(ERR_CSRF)
    if (message === 'FORBIDDEN') return apiError(ERR_FORBIDDEN)
    console.error('PUT /api/pricing/[id] error:', error)
    return apiError({ code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 })
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

    const result = await deletePricingRule({ staffId: auth.userId, ruleId: id })
    if (!result.ok) return apiError(mapDeletePricingRuleError(result.error))

    return apiError({ code: 'OK', message: 'Đã xóa quy tắc bảng giá', status: 200 } as never)
  } catch (error) {
    const message = (error as Error).message
    if (message === 'UNAUTHORIZED') return apiError(ERR_UNAUTHORIZED)
    if (message === 'CSRF_MISMATCH') return apiError(ERR_CSRF)
    if (message === 'FORBIDDEN') return apiError(ERR_FORBIDDEN)
    console.error('DELETE /api/pricing/[id] error:', error)
    return apiError({ code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 })
  }
}

// Re-export normalize helpers used in route
import { deriveDayTypeFromDays, normalizeDaysOfWeek, resolveRuleDaysOfWeek } from '@/lib/pricing'
