import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/shared/auth'
import { validateCSRF } from '@/lib/shared/csrf'
import { setClassRosterSchema, setClassRoster, mapSetClassRosterError } from '@/lib/students'
import { apiSuccess, apiError, ERR_UNAUTHORIZED, ERR_FORBIDDEN, ERR_CSRF } from '@/lib/infrastructure/api-helpers'

type Params = { params: Promise<{ id: string }> }

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireAdmin()
    await validateCSRF(request)
    const parsed = setClassRosterSchema.safeParse(await request.json())
    if (!parsed.success) return apiError({ code: 'VALIDATION', message: parsed.error.issues[0].message, status: 400 })
    const result = await setClassRoster({ staffId: auth.userId, classId: (await params).id, studentIds: parsed.data.studentIds })
    if (!result.ok) return apiError(mapSetClassRosterError(result.error))
    return apiSuccess(result.value)
  } catch (error) {
    const message = (error as Error).message
    if (message === 'UNAUTHORIZED') return apiError(ERR_UNAUTHORIZED)
    if (message === 'FORBIDDEN') return apiError(ERR_FORBIDDEN)
    if (message === 'CSRF_MISMATCH') return apiError(ERR_CSRF)
    if ((error as { code?: string }).code === 'P2034') return apiError({ code: 'CONFLICT', message: 'Dữ liệu vừa thay đổi. Hãy tải lại và thử lại', status: 409 })
    console.error('PUT /api/classes/[id]/students error:', error)
    return apiError({ code: 'UNKNOWN', message: 'Không lưu được sổ học viên', status: 500 })
  }
}
