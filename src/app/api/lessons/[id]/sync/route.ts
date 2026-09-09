import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/shared/auth'
import { validateCSRF } from '@/lib/shared/csrf'
import { retryLessonSync, mapCalendarError } from '@/lib/students'
import { apiError, apiSuccess, ERR_UNAUTHORIZED, ERR_FORBIDDEN, ERR_CSRF } from '@/lib/infrastructure/api-helpers'
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAdmin()
    await validateCSRF(request)
    const result = await retryLessonSync({ staffId: auth.userId, lessonId: (await params).id })
    return result.ok ? apiSuccess(result.value) : apiError(mapCalendarError(result.error))
  } catch (error) {
    const message = (error as Error).message
    return apiError(message === 'UNAUTHORIZED' ? ERR_UNAUTHORIZED : message === 'FORBIDDEN' ? ERR_FORBIDDEN : message === 'CSRF_MISMATCH' ? ERR_CSRF : { code: 'UNKNOWN', message: 'Không thử đồng bộ lại được', status: 500 })
  }
}
