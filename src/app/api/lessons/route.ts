import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/shared/auth'
import { validateCSRF } from '@/lib/shared/csrf'
import { repositories } from '@/lib/infrastructure/repositories'
import { calendarRangeSchema, ensureLessonsUntil, mapLessonError, createLessonSchema } from '@/lib/students'
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

    const fromParam = request.nextUrl.searchParams.get('from') ?? ''
    const toParam = request.nextUrl.searchParams.get('to') ?? ''
    const range = calendarRangeSchema.safeParse({
      from: /^\d{4}-\d{2}-\d{2}$/.test(fromParam) ? parseStartOfDay(fromParam).toISOString() : fromParam,
      to: /^\d{4}-\d{2}-\d{2}$/.test(toParam) ? new Date(parseEndOfDay(toParam).getTime() + 1).toISOString() : toParam,
    })
    if (!range.success) return apiError({ code: 'VALIDATION', message: 'Khoảng ngày không hợp lệ (tối đa một năm)', status: 400 })
    const from = new Date(range.data.from)
    const to = new Date(range.data.to)
    const expanded = await ensureLessonsUntil(to)
    const warning = expanded.ok ? undefined : `Chưa sinh tiếp được lịch: ${mapLessonError(expanded.error).message}. Các buổi đã lưu vẫn hiển thị bên dưới.`
    const statusParam = request.nextUrl.searchParams.get('status')
    const status = statusParam === 'SCHEDULED' || statusParam === 'COMPLETED' || statusParam === 'CANCELLED' ? statusParam : undefined
    const rows = await repositories.lesson.findManyBetween(from, to, {
      studentId: request.nextUrl.searchParams.get('studentId') || undefined,
      coachName: request.nextUrl.searchParams.get('coachName') || undefined, status,
    })
    const jobs = await repositories.calendarSync.list(rows.flatMap(l => [l.id, ...(l.seriesId ? [l.seriesId] : [])]))
    const lessons = rows.map(l => ({ ...l, syncStatus: jobs.find(j => j.entityId === l.id)?.status ?? jobs.find(j => j.entityId === l.seriesId)?.status ?? 'PENDING' }))

    return apiSuccess({ lessons, warning })
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
      shareNote: parsed.data.shareNote,
    })

    if (!result.ok) return apiError(mapCreateLessonError(result.error))

    const { lesson, googleSynced } = result.value
    return apiSuccess({ lesson, googleSynced }, 201)
  } catch (error) {
    const message = (error as Error).message
    if (message === 'UNAUTHORIZED') return apiError(ERR_UNAUTHORIZED)
    if (message === 'CSRF_MISMATCH') return apiError(ERR_CSRF)
    if (message === 'FORBIDDEN') return apiError(ERR_FORBIDDEN)
    console.error('POST /api/lessons error:', error)
    return apiError({ code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 })
  }
}
