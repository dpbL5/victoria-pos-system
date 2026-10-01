import { NextRequest } from 'next/server'
import { requireTrainingAccess } from '@/lib/shared/auth'
import { previousAttendanceNotes, mapMarkAttendanceError } from '@/lib/students'
import { apiError, apiSuccess, ERR_UNAUTHORIZED, ERR_FORBIDDEN } from '@/lib/infrastructure/api-helpers'

type Params = { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    await requireTrainingAccess()
    const { id } = await params
    const result = await previousAttendanceNotes({ lessonId: id })
    return result.ok ? apiSuccess(result.value) : apiError(mapMarkAttendanceError(result.error))
  } catch (error) {
    const message = (error as Error).message
    if (message === 'UNAUTHORIZED') return apiError(ERR_UNAUTHORIZED)
    if (message === 'FORBIDDEN') return apiError(ERR_FORBIDDEN)
    console.error('GET /api/lessons/[id]/previous-notes error:', error)
    return apiError({ code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 })
  }
}
