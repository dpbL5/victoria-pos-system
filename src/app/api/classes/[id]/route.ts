import { NextRequest } from 'next/server'
import { requireTrainingAccess } from '@/lib/shared/auth'
import { validateCSRF } from '@/lib/shared/csrf'
import { updateClassSchema, updateClass, deleteClass, getClassDetail, mapUpdateClassError, mapDeleteClassError } from '@/lib/students'
import { apiSuccess, apiError, ERR_UNAUTHORIZED, ERR_FORBIDDEN, ERR_CSRF } from '@/lib/infrastructure/api-helpers'

type Params = { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    await requireTrainingAccess()
    const result = await getClassDetail((await params).id)
    if (!result.ok) return apiError(mapUpdateClassError(result.error))
    return apiSuccess(result.value)
  } catch (error) {
    const message = (error as Error).message
    if (message === 'UNAUTHORIZED') return apiError(ERR_UNAUTHORIZED)
    if (message === 'FORBIDDEN') return apiError(ERR_FORBIDDEN)
    console.error('GET /api/classes/[id] error:', error)
    return apiError({ code: 'UNKNOWN', message: 'Không tải được lớp học', status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireTrainingAccess()
    await validateCSRF(request)
    const parsed = updateClassSchema.safeParse(await request.json())
    if (!parsed.success) return apiError({ code: 'VALIDATION', message: parsed.error.issues[0].message, status: 400 })
    const result = await updateClass({ staffId: auth.userId, classId: (await params).id, ...parsed.data })
    if (!result.ok) return apiError(mapUpdateClassError(result.error))
    return apiSuccess(result.value)
  } catch (error) {
    const message = (error as Error).message
    if (message === 'UNAUTHORIZED') return apiError(ERR_UNAUTHORIZED)
    if (message === 'FORBIDDEN') return apiError(ERR_FORBIDDEN)
    if (message === 'CSRF_MISMATCH') return apiError(ERR_CSRF)
    if ((error as { code?: string }).code === 'P2034') return apiError({ code: 'CONFLICT', message: 'Dữ liệu vừa thay đổi. Hãy tải lại và thử lại', status: 409 })
    console.error('PUT /api/classes/[id] error:', error)
    return apiError({ code: 'UNKNOWN', message: 'Không lưu được lớp học', status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireTrainingAccess()
    await validateCSRF(request)
    const result = await deleteClass({ staffId: auth.userId, classId: (await params).id })
    if (!result.ok) return apiError(mapDeleteClassError(result.error))
    return apiSuccess(result.value)
  } catch (error) {
    const message = (error as Error).message
    if (message === 'UNAUTHORIZED') return apiError(ERR_UNAUTHORIZED)
    if (message === 'FORBIDDEN') return apiError(ERR_FORBIDDEN)
    if (message === 'CSRF_MISMATCH') return apiError(ERR_CSRF)
    console.error('DELETE /api/classes/[id] error:', error)
    return apiError({ code: 'UNKNOWN', message: 'Không xoá được lớp học', status: 500 })
  }
}
