// ── API: /api/cashflows/[id] — sửa/xoá khoản thu chi (admin only) ─────
import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { validateCSRF } from '@/lib/csrf'
import { updateCashflowSchema } from '@/lib/cashflow/validations'
import { updateCashflow, mapUpdateCashflowError, deleteCashflow, mapDeleteCashflowError } from '@/lib/cashflow'
import { apiError, resultToResponse, ERR_UNAUTHORIZED, ERR_FORBIDDEN, ERR_CSRF } from '@/lib/infrastructure/api-helpers'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin()
    await validateCSRF(request)

    const { id } = await params
    const body = await request.json()
    const parsed = updateCashflowSchema.safeParse(body)
    if (!parsed.success) {
      return apiError({ code: 'VALIDATION', message: parsed.error.issues[0].message, status: 400 })
    }

    const result = await updateCashflow({
      id,
      staffId: auth.userId,
      fullName: auth.fullName,
      data: parsed.data,
    })

    return resultToResponse(result, mapUpdateCashflowError)
  } catch (error) {
    const message = (error as Error).message
    if (message === 'UNAUTHORIZED') return apiError(ERR_UNAUTHORIZED)
    if (message === 'CSRF_MISMATCH') return apiError(ERR_CSRF)
    if (message === 'FORBIDDEN') return apiError(ERR_FORBIDDEN)
    console.error('PUT /api/cashflows/[id] error:', error)
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
    const result = await deleteCashflow({
      id,
      staffId: auth.userId,
      fullName: auth.fullName,
    })

    return resultToResponse(result, mapDeleteCashflowError)
  } catch (error) {
    const message = (error as Error).message
    if (message === 'UNAUTHORIZED') return apiError(ERR_UNAUTHORIZED)
    if (message === 'CSRF_MISMATCH') return apiError(ERR_CSRF)
    if (message === 'FORBIDDEN') return apiError(ERR_FORBIDDEN)
    console.error('DELETE /api/cashflows/[id] error:', error)
    return apiError({ code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 })
  }
}
