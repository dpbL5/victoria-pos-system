import { repositories } from '@/lib/infrastructure/repositories'
import { z } from 'zod'
import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/shared/auth'
import { validateCSRF } from '@/lib/shared/csrf'
import { updateLessonSchema } from '@/lib/students'
import { updateLesson, deleteLesson, mapUpdateLessonError, mapDeleteLessonError } from '@/lib/students'
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
    const auth = await requireAdmin()
    await validateCSRF(request)
    const { id } = await params
    const body = await request.json()
    const parsed = updateLessonSchema.safeParse(body)

    if (!parsed.success) {
      return apiError({ code: 'VALIDATION', message: parsed.error.issues[0].message, status: 400 })
    }

    const result = await updateLesson({
      staffId: auth.userId,
      lessonId: id,
      version: parsed.data.version,
      studentIds: parsed.data.studentIds,
      shareNote: parsed.data.shareNote,
      title: parsed.data.title,
      coachName: parsed.data.coachName,
      startsAt: parsed.data.startsAt ? new Date(parsed.data.startsAt) : undefined,
      durationMin: parsed.data.durationMin,
      note: parsed.data.note,
    })

    if (!result.ok) return apiError(mapUpdateLessonError(result.error))

    const { lesson, googleSynced } = result.value
    return apiSuccess({ lesson, googleSynced })
  } catch (error) {
    const message = (error as Error).message
    if (message === 'UNAUTHORIZED') return apiError(ERR_UNAUTHORIZED)
    if (message === 'CSRF_MISMATCH') return apiError(ERR_CSRF)
    if (message === 'FORBIDDEN') return apiError(ERR_FORBIDDEN)
    console.error('PATCH /api/lessons/[id] error:', error)
    return apiError({ code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireAdmin()
    await validateCSRF(request)
    const { id } = await params

    const parsed = z.object({ version: z.number().int().positive() }).safeParse(await request.json())
    if (!parsed.success) return apiError({ code: 'VALIDATION', message: 'Thiếu phiên bản buổi học', status: 400 })
    const result = await deleteLesson({ staffId: auth.userId, lessonId: id, version: parsed.data.version })

    if (!result.ok) return apiError(mapDeleteLessonError(result.error))
    return apiSuccess({ deleted: true })
  } catch (error) {
    const message = (error as Error).message
    if (message === 'UNAUTHORIZED') return apiError(ERR_UNAUTHORIZED)
    if (message === 'CSRF_MISMATCH') return apiError(ERR_CSRF)
    if (message === 'FORBIDDEN') return apiError(ERR_FORBIDDEN)
    console.error('DELETE /api/lessons/[id] error:', error)
    return apiError({ code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 })
  }
}

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    await requireAdmin()
    const lesson = await repositories.lesson.findById((await params).id)
    return lesson ? apiSuccess(lesson) : apiError({ code: 'NOT_FOUND', message: 'Không tìm thấy buổi học', status: 404 })
  } catch (error) {
    const message = (error as Error).message
    return apiError(message === 'UNAUTHORIZED' ? ERR_UNAUTHORIZED : message === 'FORBIDDEN' ? ERR_FORBIDDEN : { code: 'UNKNOWN', message: 'Không tải được buổi học', status: 500 })
  }
}
