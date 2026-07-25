import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requireMutationAuth } from '@/lib/auth'
import { closeShiftSchema } from '@/lib/validations/shift'
import { closeShift, mapCloseShiftError } from '@/lib/business/use-cases/closeShift'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireMutationAuth(request)

    const { id } = await params
    const body = await request.json()
    const parsed = closeShiftSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0].message },
        { status: 400 }
      )
    }

    const result = await closeShift({
      shiftId: id,
      staffId: auth.userId,
      staffRole: auth.role,
      username: auth.username,
      fullName: auth.fullName,
      closingCash: parsed.data.closingCash,
      notes: parsed.data.notes,
      toolCounts: parsed.data.toolCounts,
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
    const mapped = mapCloseShiftError(error as Error)
    return NextResponse.json(
      { success: false, code: mapped.code, error: mapped.message },
      { status: mapped.status }
    )
  }
}
