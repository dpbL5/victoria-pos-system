import { NextRequest } from 'next/server'
import { requireMutationAuth } from '@/lib/shared/auth'
import {
  removeSellItems,
  mapRemoveSellItemsError,
  syncSessionSellItems,
  mapSyncSessionSellItemsError,
} from '@/lib/sessions'
import {
  apiError,
  resultToResponse,
  ERR_UNAUTHORIZED,
  ERR_CSRF,
} from '@/lib/infrastructure/api-helpers'
import { z } from 'zod'

const removeSchema = z.object({
  itemIds: z
    .array(z.string().uuid('ID dòng bán kèm không hợp lệ'))
    .min(1, 'Cần chọn ít nhất một dòng bán kèm'),
})

const syncSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().uuid('ID sản phẩm không hợp lệ'),
        quantity: z.number().int().positive('Số lượng phải lớn hơn 0'),
      }),
    )
    .max(200, 'Quá nhiều dòng hàng'),
})

/**
 * Đặt danh sách hàng chờ thu của phiên đúng bằng `items` — dùng khi nhân viên
 * sửa hàng hoá trong màn thu tiền rồi đóng màn đó (không tạo hoá đơn).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireMutationAuth(request)
    const { id } = await params

    const body = await request.json()
    const parsed = syncSchema.safeParse(body)

    if (!parsed.success) {
      return apiError({ code: 'VALIDATION', message: parsed.error.issues[0].message, status: 400 })
    }

    const result = await syncSessionSellItems({
      sessionId: id,
      staffId: auth.userId,
      items: parsed.data.items,
    })

    return resultToResponse(result, mapSyncSessionSellItemsError)
  } catch (error) {
    const message = (error as Error).message
    if (message === 'UNAUTHORIZED') return apiError(ERR_UNAUTHORIZED)
    if (message === 'CSRF_MISMATCH') return apiError(ERR_CSRF)
    console.error('PATCH /api/sessions/[id]/sell-items error:', error)
    return apiError({ code: 'SERVER_ERROR', message: 'Lỗi máy chủ', status: 500 })
  }
}

/** Xoá các dòng bán kèm chưa checkout khỏi phiên (hoàn kho tương ứng) */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireMutationAuth(request)
    const { id } = await params

    const body = await request.json()
    const parsed = removeSchema.safeParse(body)

    if (!parsed.success) {
      return apiError({ code: 'VALIDATION', message: parsed.error.issues[0].message, status: 400 })
    }

    const result = await removeSellItems({
      sessionId: id,
      staffId: auth.userId,
      itemIds: parsed.data.itemIds,
    })

    return resultToResponse(result, mapRemoveSellItemsError)
  } catch (error) {
    const message = (error as Error).message
    if (message === 'UNAUTHORIZED') return apiError(ERR_UNAUTHORIZED)
    if (message === 'CSRF_MISMATCH') return apiError(ERR_CSRF)
    console.error('DELETE /api/sessions/[id]/sell-items error:', error)
    return apiError({ code: 'SERVER_ERROR', message: 'Lỗi máy chủ', status: 500 })
  }
}
