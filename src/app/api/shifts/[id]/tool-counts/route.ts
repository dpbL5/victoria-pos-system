import { NextRequest } from 'next/server'
import { requireMutationAuth } from '@/lib/shared/auth'
import { logToolCount, mapLogToolCountError, logToolCountSchema } from '@/lib/shifts'
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
    const parsed = logToolCountSchema.safeParse(body)

    if (!parsed.success) {
      return apiError({ code: 'VALIDATION', message: parsed.error.issues[0].message, status: 400 })
    }

    const result = await logToolCount({
      shiftId: id,
      staffId: auth.userId,
      username: auth.username,
      fullName: auth.fullName,
      role: auth.role,
      toolCounts: parsed.data.toolCounts,
    })

    return resultToResponse(result, mapLogToolCountError)
  } catch (error) {
    const message = (error as Error).message
    if (message === 'UNAUTHORIZED') return apiError(ERR_UNAUTHORIZED)
    if (message === 'CSRF_MISMATCH') return apiError(ERR_CSRF)
    console.error('POST /api/shifts/[id]/tool-counts error:', error)
    return apiError({ code: 'SERVER_ERROR', message: 'Lỗi máy chủ', status: 500 })
  }
}
