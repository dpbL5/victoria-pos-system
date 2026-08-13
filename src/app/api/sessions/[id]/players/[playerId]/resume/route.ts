import { NextRequest, NextResponse } from 'next/server'
import { requireMutationAuth } from '@/lib/shared/auth'
import { resumePlayer, mapResumePlayerError } from '@/lib/sessions'
import {
  apiError,
  resultToResponse,
  ERR_UNAUTHORIZED,
  ERR_CSRF,
} from '@/lib/infrastructure/api-helpers'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; playerId: string }> }
) {
  try {
    const auth = await requireMutationAuth(request)
    const { id, playerId } = await params

    const result = await resumePlayer({
      sessionId: id,
      playerId,
      staffId: auth.userId,
    })

    return resultToResponse(result, mapResumePlayerError)
  } catch (error) {
    const message = (error as Error).message
    if (message === 'UNAUTHORIZED') return apiError(ERR_UNAUTHORIZED)
    if (message === 'CSRF_MISMATCH') return apiError(ERR_CSRF)
    console.error('POST /api/sessions/[id]/players/[playerId]/resume error:', error)
    return NextResponse.json({ success: false, error: 'Lỗi máy chủ' }, { status: 500 })
  }
}
