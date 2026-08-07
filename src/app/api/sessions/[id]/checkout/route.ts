import { NextRequest } from 'next/server'
import { requireMutationAuth } from '@/lib/auth'
import { checkoutSessionSchema } from '@/lib/validations/session'
import { checkOut, mapCheckoutError } from '@/lib/sessions'
import {
  apiError,
  resultToResponse,
  ERR_UNAUTHORIZED,
  ERR_CSRF,
} from '@/lib/infrastructure/api-helpers'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireMutationAuth(request)
    const { id } = await params

    const body = await request.json()
    const parsed = checkoutSessionSchema.safeParse(body)

    if (!parsed.success) {
      return apiError({ code: 'VALIDATION', message: parsed.error.issues[0].message, status: 400 })
    }

    const result = await checkOut({
      sessionId: id,
      staffId: auth.userId,
      paymentMethod: parsed.data.paymentMethod,
      promotionRuleId: parsed.data.promotionRuleId ?? undefined,
      endTime: parsed.data.endTime ? new Date(parsed.data.endTime) : undefined,
      items: parsed.data.items,
      notes: parsed.data.notes,
      pricingGroupId: parsed.data.pricingGroupId,
      playerCount: parsed.data.playerCount,
      parkingVehicleCount: parsed.data.parkingVehicleCount ?? 0,
    })

    return resultToResponse(result, mapCheckoutError)
  } catch (error) {
    const message = (error as Error).message
    if (message === 'UNAUTHORIZED') return apiError(ERR_UNAUTHORIZED)
    if (message === 'CSRF_MISMATCH') return apiError(ERR_CSRF)
    console.error('POST /api/sessions/[id]/checkout error:', error)
    return apiError({ code: 'SERVER_ERROR', message: 'Lỗi máy chủ', status: 500 })
  }
}
