import { NextRequest } from 'next/server'
import { requireMutationAuth } from '@/lib/auth'
import { sellItems, mapSellItemsError } from '@/lib/sessions'
import {
  apiError,
  resultToResponse,
  ERR_UNAUTHORIZED,
  ERR_CSRF,
} from '@/lib/infrastructure/api-helpers'
import { z } from 'zod'

const sellSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().uuid('ID sản phẩm không hợp lệ'),
        quantity: z.number().int().positive('Số lượng phải lớn hơn 0'),
      })
    )
    .min(1, 'Cần chọn ít nhất một sản phẩm'),
  notes: z.string().max(500).optional(),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireMutationAuth(request)
    const { id } = await params

    const body = await request.json()
    const parsed = sellSchema.safeParse(body)

    if (!parsed.success) {
      return apiError({ code: 'VALIDATION', message: parsed.error.issues[0].message, status: 400 })
    }

    const result = await sellItems({
      sessionId: id,
      staffId: auth.userId,
      items: parsed.data.items,
      notes: parsed.data.notes,
    })

    return resultToResponse(result, mapSellItemsError)
  } catch (error) {
    const message = (error as Error).message
    if (message === 'UNAUTHORIZED') return apiError(ERR_UNAUTHORIZED)
    if (message === 'CSRF_MISMATCH') return apiError(ERR_CSRF)
    console.error('POST /api/sessions/[id]/sell error:', error)
    return apiError({ code: 'SERVER_ERROR', message: 'Lỗi máy chủ', status: 500 })
  }
}
