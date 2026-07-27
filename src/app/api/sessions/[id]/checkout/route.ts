import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requireMutationAuth } from '@/lib/auth'
import { checkoutSessionSchema } from '@/lib/validations/session'
import { checkOut, mapCheckoutError } from '@/lib/business/use-cases/checkOut'

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
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0].message },
        { status: 400 }
      )
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

    return NextResponse.json({ success: true, data: result })
  } catch (error) {
    const message = (error as Error).message
    if (message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 })
    }
    if (message === 'CSRF_MISMATCH') {
      return NextResponse.json({ success: false, error: 'Yêu cầu không hợp lệ (CSRF)' }, { status: 403 })
    }
    console.error('POST /api/sessions/[id]/checkout error:', error)
    const mapped = mapCheckoutError(error as Error)
    return NextResponse.json(
      { success: false, code: mapped.code, error: mapped.message },
      { status: mapped.status }
    )
  }
}
