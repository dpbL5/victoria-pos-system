import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/shared/auth'
import { validateCSRF } from '@/lib/shared/csrf'
import { previewSeriesChange, seriesMutationSchema, updateSeries, deleteSeries, mapLessonError } from '@/lib/students'
import { parseLocalDate, parseLocalDateEnd } from '@/lib/shared/utils'
import { apiSuccess, apiError, ERR_UNAUTHORIZED, ERR_FORBIDDEN, ERR_CSRF } from '@/lib/infrastructure/api-helpers'
type Params = { params: Promise<{ id: string }> }

async function mutate(request: NextRequest, { params }: Params, remove: boolean) {
  try {
    const auth = await requireAdmin()
    await validateCSRF(request)
    const parsed = seriesMutationSchema.safeParse(await request.json())
    if (!parsed.success) return apiError({ code: 'VALIDATION', message: parsed.error.issues[0].message, status: 400 })
    const { startsOn, endsOn, ...data } = parsed.data
    const input = { ...data, staffId: auth.userId, seriesId: (await params).id }
    const result = remove ? await deleteSeries(input) : await updateSeries({ ...input, startsOn: startsOn ? parseLocalDate(startsOn) : undefined, endsOn: typeof endsOn === 'string' ? parseLocalDateEnd(endsOn) : endsOn })
    return result.ok ? apiSuccess(result.value) : apiError(mapLessonError(result.error))
  } catch (error) {
    const message = (error as Error).message
    if (message === 'UNAUTHORIZED') return apiError(ERR_UNAUTHORIZED)
    if (message === 'FORBIDDEN') return apiError(ERR_FORBIDDEN)
    if (message === 'CSRF_MISMATCH') return apiError(ERR_CSRF)
    if ((error as { code?: string }).code === 'P2034') return apiError({ code: 'CONFLICT', message: 'Lịch vừa thay đổi. Hãy tải lại và thử lại', status: 409 })
    return apiError({ code: 'UNKNOWN', message: 'Không cập nhật được lịch lặp', status: 500 })
  }
}
export const PATCH = (request: NextRequest, params: Params) => mutate(request, params, false)
export const DELETE = (request: NextRequest, params: Params) => mutate(request, params, true)

export async function GET(request: NextRequest, { params }: Params) {
  try {
    await requireAdmin()
    const lessonId = request.nextUrl.searchParams.get('lessonId')
    const scope = request.nextUrl.searchParams.get('scope')
    if (!lessonId || (scope !== 'FOLLOWING' && scope !== 'ALL')) return apiError({ code: 'VALIDATION', message: 'Chọn buổi và phạm vi thay đổi', status: 400 })
    const result = await previewSeriesChange({ seriesId: (await params).id, lessonId, scope })
    return result.ok ? apiSuccess(result.value) : apiError(mapLessonError(result.error))
  } catch (error) {
    const message = (error as Error).message
    return apiError(message === 'UNAUTHORIZED' ? ERR_UNAUTHORIZED : message === 'FORBIDDEN' ? ERR_FORBIDDEN : { code: 'UNKNOWN', message: 'Không tải được phạm vi lịch', status: 500 })
  }
}
