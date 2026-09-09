import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/shared/auth'
import { validateCSRF } from '@/lib/shared/csrf'
import { calendarRangeSchema, retryCalendar, mapCalendarError } from '@/lib/students'
import { apiError, apiSuccess, ERR_UNAUTHORIZED, ERR_FORBIDDEN, ERR_CSRF } from '@/lib/infrastructure/api-helpers'
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin()
    await validateCSRF(request)
    const parsed = calendarRangeSchema.safeParse(await request.json())
    if (!parsed.success) return apiError({ code: 'VALIDATION', message: 'Chọn khoảng đồng bộ không quá một năm', status: 400 })
    const result = await retryCalendar({ staffId: auth.userId, from: new Date(parsed.data.from), to: new Date(parsed.data.to) })
    return result.ok ? apiSuccess(result.value) : apiError(mapCalendarError(result.error))
  } catch (error) {
    const message = (error as Error).message
    return apiError(message === 'UNAUTHORIZED' ? ERR_UNAUTHORIZED : message === 'FORBIDDEN' ? ERR_FORBIDDEN : message === 'CSRF_MISMATCH' ? ERR_CSRF : { code: 'GOOGLE_ERROR', message: 'Không đưa được lịch vào hàng đợi đồng bộ', status: 500 })
  }
}
