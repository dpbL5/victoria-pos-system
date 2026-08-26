import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/shared/auth'
import { validateCSRF } from '@/lib/shared/csrf'
import { disconnectCalendar } from '@/lib/students'
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

    const result = await disconnectCalendar({ staffId: auth.userId })

    if (!result.ok) {
      return apiError({ code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 })
    }

    return apiSuccess(result.value)
  } catch (error) {
    const message = (error as Error).message
    if (message === 'UNAUTHORIZED') return apiError(ERR_UNAUTHORIZED)
    if (message === 'CSRF_MISMATCH') return apiError(ERR_CSRF)
    if (message === 'FORBIDDEN') return apiError(ERR_FORBIDDEN)
    console.error('POST /api/google/disconnect error:', error)
    return apiError({ code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 })
  }
}
