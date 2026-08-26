import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/shared/auth'
import { validateCSRF } from '@/lib/shared/csrf'
import { createSeriesSchema } from '@/lib/students'
import { createSeries, mapCreateSeriesError } from '@/lib/students'
import { parseLocalDate, parseLocalDateEnd } from '@/lib/shared/utils'
import {
  apiSuccess,
  apiError,
  ERR_UNAUTHORIZED,
  ERR_FORBIDDEN,
  ERR_CSRF,
} from '@/lib/infrastructure/api-helpers'

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin()
    await validateCSRF(request)
    const body = await request.json()
    const parsed = createSeriesSchema.safeParse(body)

    if (!parsed.success) {
      return apiError({ code: 'VALIDATION', message: parsed.error.issues[0].message, status: 400 })
    }

    const startsOn = parseLocalDate(parsed.data.startsOn)
    const endsOn = parsed.data.endsOn ? parseLocalDateEnd(parsed.data.endsOn) : null

    const result = await createSeries({
      staffId: auth.userId,
      title: parsed.data.title,
      coachName: parsed.data.coachName,
      daysOfWeek: parsed.data.daysOfWeek,
      startTime: parsed.data.startTime,
      durationMin: parsed.data.durationMin,
      startsOn,
      endsOn,
      studentIds: parsed.data.studentIds,
    })

    if (!result.ok) return apiError(mapCreateSeriesError(result.error))

    const { series, generatedCount, googleSynced, warning } = result.value
    return apiSuccess({ series, generatedCount, googleSynced, warning }, 201)
  } catch (error) {
    const message = (error as Error).message
    if (message === 'UNAUTHORIZED') return apiError(ERR_UNAUTHORIZED)
    if (message === 'CSRF_MISMATCH') return apiError(ERR_CSRF)
    if (message === 'FORBIDDEN') return apiError(ERR_FORBIDDEN)
    console.error('POST /api/series error:', error)
    return apiError({ code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 })
  }
}
