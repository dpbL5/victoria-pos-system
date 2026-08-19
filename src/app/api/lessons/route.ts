import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/shared/auth'
import { validateCSRF } from '@/lib/shared/csrf'
import { repositories } from '@/lib/infrastructure/repositories'
import { createLessonSchema } from '@/lib/students'
import { createLesson, mapCreateLessonError } from '@/lib/students'
import { parseStartOfDay, parseEndOfDay } from '@/lib/shared/utils'
import {
  apiSuccess,
  apiError,
  ERR_UNAUTHORIZED,
  ERR_FORBIDDEN,
  ERR_CSRF,
} from '@/lib/infrastructure/api-helpers'

export async function GET(request: NextRequest) {
  try {
    await requireAdmin()

    const fromParam = request.nextUrl.searchParams.get('from')
    const toParam = request.nextUrl.searchParams.get('to')
    const from = fromParam ? parseStartOfDay(fromParam) : new Date()
    const to = toParam ? parseEndOfDay(toParam) : parseEndOfDay(new Date().toISOString().slice(0, 10))

    const lessons = await repositories.lesson.findManyBetween(from, to)

    return apiSuccess(lessons)
  } catch (error) {
    const message = (error as Error).message
    if (message === 'UNAUTHORIZED') return apiError(ERR_UNAUTHORIZED)
    if (message === 'FORBIDDEN') return apiError(ERR_FORBIDDEN)
    console.error('GET /api/lessons error:', error)
    return apiError({ code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin()
    await validateCSRF(request)
    const body = await request.json()
    const parsed = createLessonSchema.safeParse(body)

    if (!parsed.success) {
      return apiError({ code: 'VALIDATION', message: parsed.error.issues[0].message, status: 400 })
    }

    const result = await createLesson({
      staffId: auth.userId,
      title: parsed.data.title,
      coachName: parsed.data.coachName,
      startsAt: new Date(parsed.data.startsAt),
      durationMin: parsed.data.durationMin,
      studentIds: parsed.data.studentIds,
      note: parsed.data.note,
    })

    if (!result.ok) return apiError(mapCreateLessonError(result.error))

    const { lesson, googleSynced, warning } = result.value
    return apiSuccess({ lesson, googleSynced, warning }, 201)
  } catch (error) {
    const message = (error as Error).message
    if (message === 'UNAUTHORIZED') return apiError(ERR_UNAUTHORIZED)
    if (message === 'CSRF_MISMATCH') return apiError(ERR_CSRF)
    if (message === 'FORBIDDEN') return apiError(ERR_FORBIDDEN)
    console.error('POST /api/lessons error:', error)
    return apiError({ code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 })
  }
}
