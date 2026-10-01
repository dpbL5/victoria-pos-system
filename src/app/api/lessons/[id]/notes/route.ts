import { NextRequest } from 'next/server'
import { requireTrainingAccess } from '@/lib/shared/auth'
import { validateCSRF } from '@/lib/shared/csrf'
import { updateLessonNotesSchema } from '@/lib/students'
import { updateLessonStudentNotes, mapLessonNotesError } from '@/lib/students'
import {
  apiSuccess,
  apiError,
  ERR_UNAUTHORIZED,
  ERR_FORBIDDEN,
  ERR_CSRF,
} from '@/lib/infrastructure/api-helpers'

type Params = { params: Promise<{ id: string }> }

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireTrainingAccess()
    await validateCSRF(request)
    const { id } = await params
    const body = await request.json()
    const parsed = updateLessonNotesSchema.safeParse(body)

    if (!parsed.success) {
      return apiError({ code: 'VALIDATION', message: parsed.error.issues[0].message, status: 400 })
    }

    const result = await updateLessonStudentNotes({
      staffId: auth.userId,
      lessonId: id,
      version: parsed.data.version,
      entries: parsed.data.entries,
    })

    if (!result.ok) return apiError(mapLessonNotesError(result.error))

    return apiSuccess({ lesson: result.value.lesson })
  } catch (error) {
    const message = (error as Error).message
    if (message === 'UNAUTHORIZED') return apiError(ERR_UNAUTHORIZED)
    if (message === 'CSRF_MISMATCH') return apiError(ERR_CSRF)
    if (message === 'FORBIDDEN') return apiError(ERR_FORBIDDEN)
    console.error('PATCH /api/lessons/[id]/notes error:', error)
    return apiError({ code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 })
  }
}
