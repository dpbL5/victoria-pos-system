import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/shared/auth'
import { validateCSRF } from '@/lib/shared/csrf'
import { applyStockMovement, mapApplyStockMovementError } from '@/lib/sessions'
import { findOpenShiftForStaff } from '@/lib/shifts'
import { repositories } from '@/lib/infrastructure/repositories'
import { stockMovementSchema } from '@/lib/sessions'
import { apiError, resultToResponse, ERR_UNAUTHORIZED, ERR_FORBIDDEN, ERR_CSRF } from '@/lib/infrastructure/api-helpers'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin()
    await validateCSRF(request)
    const { id } = await params

    const body = await request.json()
    const parsed = stockMovementSchema.safeParse(body)

    if (!parsed.success) {
      return apiError({ code: 'VALIDATION', message: parsed.error.issues[0].message, status: 400 })
    }

    if (parsed.data.type === 'RESTOCK' && parsed.data.quantity <= 0) {
      return apiError({ code: 'VALIDATION', message: 'Nhập kho phải có số lượng lớn hơn 0', status: 400 })
    }

    const openShift = await findOpenShiftForStaff(repositories as never, auth.userId)

    const result = await applyStockMovement({
      productId: id,
      staffId: auth.userId,
      type: parsed.data.type as 'RESTOCK' | 'ADJUSTMENT',
      quantity: parsed.data.quantity,
      unitCost: parsed.data.unitCost ?? null,
      reason: parsed.data.reason ?? null,
      shiftId: openShift?.id ?? null,
    })

    return resultToResponse(result, mapApplyStockMovementError)
  } catch (error) {
    const message = (error as Error).message
    if (message === 'UNAUTHORIZED') return apiError(ERR_UNAUTHORIZED)
    if (message === 'CSRF_MISMATCH') return apiError(ERR_CSRF)
    if (message === 'FORBIDDEN') return apiError(ERR_FORBIDDEN)
    console.error('POST /api/products/[id]/stock error:', error)
    return apiError({ code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 })
  }
}
