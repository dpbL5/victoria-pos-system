import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/shared/auth'
import { validateCSRF } from '@/lib/shared/csrf'
import { addClassStudent, removeClassStudent, mapSetClassRosterError } from '@/lib/students'
import { apiSuccess, apiError, ERR_UNAUTHORIZED, ERR_FORBIDDEN, ERR_CSRF } from '@/lib/infrastructure/api-helpers'

type Params = { params: Promise<{ id: string; studentId: string }> }

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireAdmin()
    await validateCSRF(request)
    const { id, studentId } = await params
    const result = await addClassStudent({ staffId: auth.userId, classId: id, studentId })
    if (!result.ok) return apiError(mapSetClassRosterError(result.error))
    return apiSuccess(result.value)
  } catch (error) {
    const message = (error as Error).message
    if (message === 'UNAUTHORIZED') return apiError(ERR_UNAUTHORIZED)
    if (message === 'FORBIDDEN') return apiError(ERR_FORBIDDEN)
    if (message === 'CSRF_MISMATCH') return apiError(ERR_CSRF)
    if ((error as { code?: string }).code === 'P2034') return apiError({ code: 'CONFLICT', message: 'Dữ liệu vừa thay đổi. Hãy tải lại và thử lại', status: 409 })
    console.error('POST /api/classes/[id]/students/[studentId] error:', error)
    return apiError({ code: 'UNKNOWN', message: 'Không xếp được học viên vào lớp', status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireAdmin()
    await validateCSRF(request)
    const { id, studentId } = await params
    const result = await removeClassStudent({ staffId: auth.userId, classId: id, studentId })
    if (!result.ok) return apiError(mapSetClassRosterError(result.error))
    return apiSuccess(result.value)
  } catch (error) {
    const message = (error as Error).message
    if (message === 'UNAUTHORIZED') return apiError(ERR_UNAUTHORIZED)
    if (message === 'FORBIDDEN') return apiError(ERR_FORBIDDEN)
    if (message === 'CSRF_MISMATCH') return apiError(ERR_CSRF)
    if ((error as { code?: string }).code === 'P2034') return apiError({ code: 'CONFLICT', message: 'Dữ liệu vừa thay đổi. Hãy tải lại và thử lại', status: 409 })
    console.error('DELETE /api/classes/[id]/students/[studentId] error:', error)
    return apiError({ code: 'UNKNOWN', message: 'Không rút được học viên khỏi lớp', status: 500 })
  }
}
