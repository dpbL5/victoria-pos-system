import { NextRequest, NextResponse } from 'next/server'
import { requireMutationAuth } from '@/lib/shared/auth'
import { pauseSession, mapPauseSessionError } from '@/lib/sessions'
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

    const result = await pauseSession({
      sessionId: id,
      staffId: auth.userId,
    })

    return resultToResponse(result, mapPauseSessionError)
  } catch (error) {
    const message = (error as Error).message
    if (message === 'UNAUTHORIZED') return apiError(ERR_UNAUTHORIZED)
    if (message === 'CSRF_MISMATCH') return apiError(ERR_CSRF)
    console.error('POST /api/sessions/[id]/pause error:', error)
    return NextResponse.json({ success: false, error: 'Lỗi máy chủ' }, { status: 500 })
  }
}
