import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/shared/auth'
import { repositories } from '@/lib/infrastructure/repositories'
import {
  apiSuccess,
  apiError,
  ERR_UNAUTHORIZED,
  ERR_FORBIDDEN,
} from '@/lib/infrastructure/api-helpers'

type Params = { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, { params }: Params) {
  try {
    await requireAdmin()

    const { id } = await params
    const student = await repositories.student.findById(id)
    if (!student) {
      return apiError({ code: 'STUDENT_NOT_FOUND', message: 'Không tìm thấy học viên', status: 404 })
    }

    const now = new Date()
    const upcoming = await repositories.lesson.findUpcomingByStudent(id, now)
    const past = await repositories.lesson.findPastByStudent(id, now)

    return apiSuccess({ upcoming, past })
  } catch (error) {
    const message = (error as Error).message
    if (message === 'UNAUTHORIZED') return apiError(ERR_UNAUTHORIZED)
    if (message === 'FORBIDDEN') return apiError(ERR_FORBIDDEN)
    console.error('GET /api/students/[id]/lessons error:', error)
    return apiError({ code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 })
  }
}
