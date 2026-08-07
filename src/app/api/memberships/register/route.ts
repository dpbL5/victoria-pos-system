import { NextRequest } from 'next/server'
import { requireMutationAuth } from '@/lib/auth'
import { registerMember, mapRegisterMemberError, registerMemberSchema } from '@/lib/memberships'
import {
  apiError,
  resultToResponse,
  ERR_UNAUTHORIZED,
  ERR_CSRF,
} from '@/lib/infrastructure/api-helpers'

export async function POST(request: NextRequest) {
  try {
    const auth = await requireMutationAuth(request)

    const body = await request.json()
    const parsed = registerMemberSchema.safeParse(body)

    if (!parsed.success) {
      return apiError({ code: 'VALIDATION', message: parsed.error.issues[0].message, status: 400 })
    }

    if (parsed.data.paidAt && auth.role !== 'ADMIN') {
      return apiError({ code: 'FORBIDDEN', message: 'Chỉ quản trị viên được chọn ngày thu phí', status: 403 })
    }

    const paidAt = parsed.data.paidAt ? new Date(parsed.data.paidAt) : new Date()
    if (paidAt.getTime() > Date.now() + 5 * 60 * 1000) {
      return apiError({ code: 'VALIDATION', message: 'Ngày thu phí không được ở tương lai', status: 400 })
    }

    const result = await registerMember({
      staffId: auth.userId,
      fullName: parsed.data.fullName,
      phone: parsed.data.phone,
      planId: parsed.data.planId,
      paymentMethod: parsed.data.paymentMethod,
      paidAt,
      notes: parsed.data.notes,
    })

    return resultToResponse(result, mapRegisterMemberError, 201)
  } catch (error) {
    const message = (error as Error).message
    if (message === 'UNAUTHORIZED') return apiError(ERR_UNAUTHORIZED)
    if (message === 'CSRF_MISMATCH') return apiError(ERR_CSRF)
    console.error('POST /api/memberships/register error:', error)
    return apiError({ code: 'SERVER_ERROR', message: 'Lỗi máy chủ', status: 500 })
  }
}
