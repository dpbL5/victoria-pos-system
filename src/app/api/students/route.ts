import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/shared/auth'
import { validateCSRF } from '@/lib/shared/csrf'
import { repositories } from '@/lib/infrastructure/repositories'
import { createStudentSchema } from '@/lib/students'
import { createStudent, mapCreateStudentError } from '@/lib/students'
import {
  apiSuccess,
  apiError,
  ERR_UNAUTHORIZED,
  ERR_FORBIDDEN,
  ERR_CSRF,
} from '@/lib/infrastructure/api-helpers'

export async function GET(request: NextRequest) {
  try {
    await requireAdmin()

    const search = request.nextUrl.searchParams.get('search') || undefined
    const statusParam = request.nextUrl.searchParams.get('status') || undefined
    const status = statusParam === 'ACTIVE' || statusParam === 'INACTIVE' ? statusParam : undefined
    const limitParam = Number(request.nextUrl.searchParams.get('limit')) || undefined

    const students = await repositories.student.findMany({ search, status, limit: limitParam })

    return apiSuccess(students)
  } catch (error) {
    const message = (error as Error).message
    if (message === 'UNAUTHORIZED') return apiError(ERR_UNAUTHORIZED)
    if (message === 'FORBIDDEN') return apiError(ERR_FORBIDDEN)
    console.error('GET /api/students error:', error)
    return apiError({ code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin()
    await validateCSRF(request)
    const body = await request.json()
    const parsed = createStudentSchema.safeParse(body)

    if (!parsed.success) {
      return apiError({ code: 'VALIDATION', message: parsed.error.issues[0].message, status: 400 })
    }

    const result = await createStudent({
      staffId: auth.userId,
      fullName: parsed.data.fullName,
      phone: parsed.data.phone,
      birthYear: parsed.data.birthYear ?? undefined,
      notes: parsed.data.notes,
    })

    if (!result.ok) return apiError(mapCreateStudentError(result.error))
    return apiSuccess(result.value, 201)
  } catch (error) {
    const message = (error as Error).message
    if (message === 'UNAUTHORIZED') return apiError(ERR_UNAUTHORIZED)
    if (message === 'CSRF_MISMATCH') return apiError(ERR_CSRF)
    if (message === 'FORBIDDEN') return apiError(ERR_FORBIDDEN)
    console.error('POST /api/students error:', error)
    return apiError({ code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 })
  }
}
