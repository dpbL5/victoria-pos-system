import { NextRequest } from 'next/server'
import { requireMutationAuth } from '@/lib/shared/auth'
import { removeSellItems, mapRemoveSellItemsError } from '@/lib/sessions'
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
