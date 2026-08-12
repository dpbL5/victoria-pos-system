// ── PATCH /api/sessions/[id]/players/[playerId] — đổi tên người chơi ─────
import { NextRequest, NextResponse } from 'next/server'
import { requireMutationAuth } from '@/lib/shared/auth'
import { renamePlayer, mapRenamePlayerError } from '@/lib/sessions'
import { renamePlayerSchema } from '@/lib/sessions'
import {
  apiError,
  resultToResponse,
  ERR_UNAUTHORIZED,
  ERR_CSRF,
} from '@/lib/infrastructure/api-helpers'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; playerId: string }> }
) {
  try {
    const auth = await requireMutationAuth(request)
    const { id, playerId } = await params

    const body = await request.json()
    const parsed = renamePlayerSchema.safeParse(body)
    if (!parsed.success) {
      return apiError({ code: 'VALIDATION', message: parsed.error.issues[0].message, status: 400 })
    }

    const result = await renamePlayer({
      sessionId: id,
      playerId,
      staffId: auth.userId,
      role: auth.role,
      name: parsed.data.name,
    })

    return resultToResponse(result, mapRenamePlayerError)
  } catch (error) {
    const message = (error as Error).message
    if (message === 'UNAUTHORIZED') return apiError(ERR_UNAUTHORIZED)
    if (message === 'CSRF_MISMATCH') return apiError(ERR_CSRF)
    if (message === 'RATE_LIMITED')
      return apiError({ code: 'RATE_LIMITED', message: 'Quá nhiều yêu cầu. Thử lại sau.', status: 429 })
    console.error('PATCH /api/sessions/[id]/players/[playerId] error:', error)
    return NextResponse.json({ success: false, error: 'Lỗi máy chủ' }, { status: 500 })
  }
}
