import { NextRequest } from 'next/server'
import { requireMutationAuth } from '@/lib/shared/auth'
import { applyStockMovement, mapApplyStockMovementError } from '@/lib/sessions'
import { repositories } from '@/lib/infrastructure/repositories'
import {
  apiError,
  resultToResponse,
  ERR_UNAUTHORIZED,
  ERR_FORBIDDEN,
  ERR_CSRF,
} from '@/lib/infrastructure/api-helpers'

/**
 * Nhân viên nhận hàng dùng nội bộ (nước uống…) — trừ 1 đơn vị tồn kho.
 * Lý do ghi theo tên người thao tác, dựng ở server để không bị sửa từ client.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireMutationAuth(request)
    if (auth.role === 'TEACHER') return apiError(ERR_FORBIDDEN)
    const { id } = await params

    const openShift = await repositories.shift.findOpenIdForStaff(auth.userId)

    const result = await applyStockMovement({
      productId: id,
      staffId: auth.userId,
      type: 'ADJUSTMENT',
      quantity: -1,
      reason: `${auth.fullName} lấy nước uống`,
      shiftId: openShift?.id ?? null,
    })

    return resultToResponse(result, mapApplyStockMovementError)
  } catch (error) {
    const message = (error as Error).message
    if (message === 'UNAUTHORIZED') return apiError(ERR_UNAUTHORIZED)
    if (message === 'CSRF_MISMATCH') return apiError(ERR_CSRF)
    console.error('POST /api/products/[id]/consume error:', error)
    return apiError({ code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 })
  }
}
