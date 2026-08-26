import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/shared/auth'
import { validateCSRF } from '@/lib/shared/csrf'
import { repositories } from '@/lib/infrastructure/repositories'
import { updateStudentSchema } from '@/lib/students'
import { updateStudent, deleteStudent, mapUpdateStudentError, mapDeleteStudentError } from '@/lib/students'
import {
  apiSuccess,
  apiError,
  ERR_UNAUTHORIZED,
  ERR_FORBIDDEN,
  ERR_CSRF,
} from '@/lib/infrastructure/api-helpers'

type Params = { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    await requireAdmin()

    const { id } = await params
    const student = await repositories.student.findByIdIncludingDeleted(id)
    if (!student || student.deletedAt) {
      return apiError({ code: 'STUDENT_NOT_FOUND', message: 'Không tìm thấy học viên', status: 404 })
    }

    return apiSuccess(student)
  } catch (error) {
    const message = (error as Error).message
    if (message === 'UNAUTHORIZED') return apiError(ERR_UNAUTHORIZED)
    if (message === 'FORBIDDEN') return apiError(ERR_FORBIDDEN)
    console.error('GET /api/students/[id] error:', error)
    return apiError({ code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireAdmin()
    await validateCSRF(request)
    const { id } = await params
    const body = await request.json()
    const parsed = updateStudentSchema.safeParse(body)

    if (!parsed.success) {
      return apiError({ code: 'VALIDATION', message: parsed.error.issues[0].message, status: 400 })
    }

    const result = await updateStudent({
      staffId: auth.userId,
      studentId: id,
      fullName: parsed.data.fullName,
      phone: parsed.data.phone,
      birthYear: parsed.data.birthYear,
      notes: parsed.data.notes,
      status: parsed.data.status,
    })

    if (!result.ok) return apiError(mapUpdateStudentError(result.error))
    return apiSuccess(result.value)
  } catch (error) {
    const message = (error as Error).message
    if (message === 'UNAUTHORIZED') return apiError(ERR_UNAUTHORIZED)
    if (message === 'CSRF_MISMATCH') return apiError(ERR_CSRF)
    if (message === 'FORBIDDEN') return apiError(ERR_FORBIDDEN)
    console.error('PUT /api/students/[id] error:', error)
    return apiError({ code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireAdmin()
    await validateCSRF(request)
    const { id } = await params

    const result = await deleteStudent({ staffId: auth.userId, studentId: id })

    if (!result.ok) return apiError(mapDeleteStudentError(result.error))
    return apiSuccess({ deleted: true })
  } catch (error) {
    const message = (error as Error).message
    if (message === 'UNAUTHORIZED') return apiError(ERR_UNAUTHORIZED)
    if (message === 'CSRF_MISMATCH') return apiError(ERR_CSRF)
    if (message === 'FORBIDDEN') return apiError(ERR_FORBIDDEN)
    console.error('DELETE /api/students/[id] error:', error)
    return apiError({ code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 })
  }
}
