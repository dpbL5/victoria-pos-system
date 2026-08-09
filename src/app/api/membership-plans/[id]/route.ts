import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/shared/auth'
import { validateCSRF } from '@/lib/shared/csrf'
import {
  updateMembershipPlan,
  mapUpdateMembershipPlanError,
  deleteMembershipPlan,
  mapDeleteMembershipPlanError,
} from '@/lib/memberships'
import { updateMembershipPlanSchema } from '@/lib/memberships'
import {
  apiError,
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
    const parsed = updateMembershipPlanSchema.safeParse(body)

    if (!parsed.success) {
      return apiError({ code: 'VALIDATION', message: parsed.error.issues[0].message, status: 400 })
    }

    const result = await updateMembershipPlan({ staffId: auth.userId, planId: id, ...parsed.data })
    return resultToResponse(result, mapUpdateMembershipPlanError)
  } catch (error) {
    const message = (error as Error).message
    if (message === 'UNAUTHORIZED') return apiError(ERR_UNAUTHORIZED)
    if (message === 'CSRF_MISMATCH') return apiError(ERR_CSRF)
    if (message === 'FORBIDDEN') return apiError(ERR_FORBIDDEN)
    console.error('PUT /api/membership-plans/[id] error:', error)
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

    const result = await deleteMembershipPlan({ staffId: auth.userId, planId: id })

    if (!result.ok) return apiError(mapDeleteMembershipPlanError(result.error))
    if (result.value.deleted) {
      return new Response(JSON.stringify({ success: true, message: 'Đã xóa gói hội viên' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    return new Response(
      JSON.stringify({
        success: true,
        data: result.value.deactivated,
        message: 'Gói đang được dùng bởi hội viên, đã chuyển sang trạng thái ngừng dùng',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    const message = (error as Error).message
    if (message === 'UNAUTHORIZED') return apiError(ERR_UNAUTHORIZED)
    if (message === 'CSRF_MISMATCH') return apiError(ERR_CSRF)
    if (message === 'FORBIDDEN') return apiError(ERR_FORBIDDEN)
    console.error('DELETE /api/membership-plans/[id] error:', error)
    return apiError({ code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 })
  }
}
