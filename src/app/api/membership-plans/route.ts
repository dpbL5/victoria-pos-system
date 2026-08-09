import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, requireAuth } from '@/lib/shared/auth'
import { validateCSRF } from '@/lib/shared/csrf'
import {
  createMembershipPlan,
  mapCreateMembershipPlanError,
} from '@/lib/memberships'
import { repositories } from '@/lib/infrastructure/repositories'
import { createMembershipPlanSchema } from '@/lib/memberships'
import { apiError, resultToResponse, ERR_UNAUTHORIZED, ERR_FORBIDDEN, ERR_CSRF } from '@/lib/infrastructure/api-helpers'

export async function GET() {
  try {
    await requireAuth()

    const plans = await repositories.membershipPlan.findMany()

    return NextResponse.json({ success: true, data: plans })
  } catch (error) {
    if ((error as Error).message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 })
    }
    console.error('GET /api/membership-plans error:', error)
    return NextResponse.json({ success: false, error: 'Lỗi máy chủ' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin()
    await validateCSRF(request)

    const body = await request.json()
    const parsed = createMembershipPlanSchema.safeParse(body)

    if (!parsed.success) {
      return apiError({ code: 'VALIDATION', message: parsed.error.issues[0].message, status: 400 })
    }

    const result = await createMembershipPlan({ staffId: auth.userId, ...parsed.data })
    return resultToResponse(result, mapCreateMembershipPlanError, 201)
  } catch (error) {
    const message = (error as Error).message
    if (message === 'UNAUTHORIZED') return apiError(ERR_UNAUTHORIZED)
    if (message === 'CSRF_MISMATCH') return apiError(ERR_CSRF)
    if (message === 'FORBIDDEN') return apiError(ERR_FORBIDDEN)
    console.error('POST /api/membership-plans error:', error)
    return apiError({ code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 })
  }
}
