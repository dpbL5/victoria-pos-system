import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/shared/auth'
import { validateCSRF } from '@/lib/shared/csrf'
import { repositories } from '@/lib/infrastructure/repositories'
import { calendarAccessToken, selectCalendar, mapCalendarError, retryCalendar } from '@/lib/students'
import { apiError, apiSuccess, ERR_UNAUTHORIZED, ERR_FORBIDDEN, ERR_CSRF } from '@/lib/infrastructure/api-helpers'
function errorResponse(error: unknown) {
  const message = (error as Error).message
  return apiError(message === 'UNAUTHORIZED' ? ERR_UNAUTHORIZED : message === 'FORBIDDEN' ? ERR_FORBIDDEN : message === 'CSRF_MISMATCH' ? ERR_CSRF : { code: 'GOOGLE_ERROR', message: 'Không truy cập được Google Calendar. Hãy kết nối lại', status: 502 })
}
export async function GET() {
  try {
    await requireAdmin()
    const { accessToken } = await calendarAccessToken()
    return apiSuccess(await repositories.googleCalendar.listCalendars(accessToken))
  } catch (error) { return errorResponse(error) }
}
export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAdmin()
    await validateCSRF(request)
    const parsed = z.object({ calendarId: z.string().min(1).max(300), confirmChange: z.boolean().default(false) }).safeParse(await request.json())
    if (!parsed.success) return apiError({ code: 'VALIDATION', message: 'Chọn lịch Google hợp lệ', status: 400 })
    const result = await selectCalendar({ ...parsed.data, staffId: auth.userId })
    if (!result.ok) return apiError(mapCalendarError(result.error))
    const queued = await retryCalendar({ staffId: auth.userId, from: new Date(), to: new Date(Date.now() + 84 * 86400000) })
    if (!queued.ok) return apiError(mapCalendarError(queued.error))
    return apiSuccess(result.value)
  } catch (error) { return errorResponse(error) }
}
