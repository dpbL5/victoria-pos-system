import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAuth, requireMutationAuth, userHasPermission } from '@/lib/shared/auth'
import {
  consumeStaffProduct,
  hasReceivedStaffDrinkToday,
  mapConsumeStaffProductError,
} from '@/lib/sessions'
import { repositories } from '@/lib/infrastructure/repositories'
import {
  apiError,
  apiSuccess,
  resultToResponse,
  ERR_UNAUTHORIZED,
  ERR_FORBIDDEN,
  ERR_CSRF,
} from '@/lib/infrastructure/api-helpers'

const consumeSchema = z.object({
  productId: z.string().uuid('ID sản phẩm không hợp lệ'),
})

/** Trạng thái nhận nước hôm nay của nhân viên đang đăng nhập */
export async function GET() {
  try {
    const auth = await requireAuth()
    if (!userHasPermission(auth, 'sessions.staffDrink')) return apiError(ERR_FORBIDDEN)

    const received = await hasReceivedStaffDrinkToday(auth.userId)
    return apiSuccess({ received })
  } catch (error) {
    if ((error as Error).message === 'UNAUTHORIZED') return apiError(ERR_UNAUTHORIZED)
    console.error('GET /api/staff-consumption error:', error)
    return apiError({ code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 })
  }
}

/** Nhân viên nhận hàng dùng nội bộ — trừ 1 đơn vị tồn kho, tối đa 1 lần/ngày */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireMutationAuth(request)
    if (!userHasPermission(auth, 'sessions.staffDrink')) return apiError(ERR_FORBIDDEN)

    const body = await request.json()
    const parsed = consumeSchema.safeParse(body)
    if (!parsed.success) {
      return apiError({ code: 'VALIDATION', message: parsed.error.issues[0].message, status: 400 })
    }

    const openShift = await repositories.shift.findOpenIdForStaff(auth.userId)

    const result = await consumeStaffProduct({
      productId: parsed.data.productId,
      staffId: auth.userId,
      // Lý do dựng ở server để không bị sửa từ client
      staffName: auth.fullName,
      shiftId: openShift?.id ?? null,
    })

    return resultToResponse(result, mapConsumeStaffProductError, 201)
  } catch (error) {
    const message = (error as Error).message
    if (message === 'UNAUTHORIZED') return apiError(ERR_UNAUTHORIZED)
    if (message === 'CSRF_MISMATCH') return apiError(ERR_CSRF)
    console.error('POST /api/staff-consumption error:', error)
    return apiError({ code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 })
  }
}
