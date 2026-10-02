import { NextRequest } from 'next/server'
import { requireTrainingAccess } from '@/lib/shared/auth'
import { validateCSRF } from '@/lib/shared/csrf'
import { retryCalendar, mapCalendarError } from '@/lib/students'
import { apiError, apiSuccess, ERR_UNAUTHORIZED, ERR_FORBIDDEN, ERR_CSRF } from '@/lib/infrastructure/api-helpers'

export const runtime = 'nodejs'
/** Nút "Đồng bộ với Google Calendar" xử lý job ngay trong request — cho phép chạy lâu hơn mặc định. */
export const maxDuration = 60

export async function POST(request: NextRequest) {
  try {
    const auth = await requireTrainingAccess()
    await validateCSRF(request)
    const result = await retryCalendar({ staffId: auth.userId })
    return result.ok ? apiSuccess(result.value) : apiError(mapCalendarError(result.error))
  } catch (error) {
    const message = (error as Error).message
    return apiError(message === 'UNAUTHORIZED' ? ERR_UNAUTHORIZED : message === 'FORBIDDEN' ? ERR_FORBIDDEN : message === 'CSRF_MISMATCH' ? ERR_CSRF : { code: 'GOOGLE_ERROR', message: 'Không đưa được lịch vào hàng đợi đồng bộ', status: 500 })
  }
}
