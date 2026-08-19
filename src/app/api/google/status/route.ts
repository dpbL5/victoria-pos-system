import { requireAdmin } from '@/lib/shared/auth'
import { getCalendarStatus } from '@/lib/students'
import { getGoogleConfig } from '@/lib/google'
import {
  apiSuccess,
  apiError,
  ERR_UNAUTHORIZED,
  ERR_FORBIDDEN,
} from '@/lib/infrastructure/api-helpers'

export async function GET() {
  try {
    await requireAdmin()

    const { isConfigured } = getGoogleConfig()
    const result = await getCalendarStatus()

    if (!result.ok) {
      return apiError({ code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 })
    }

    return apiSuccess({ ...result.value, isConfigured })
  } catch (error) {
    const message = (error as Error).message
    if (message === 'UNAUTHORIZED') return apiError(ERR_UNAUTHORIZED)
    if (message === 'FORBIDDEN') return apiError(ERR_FORBIDDEN)
    console.error('GET /api/google/status error:', error)
    return apiError({ code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 })
  }
}
