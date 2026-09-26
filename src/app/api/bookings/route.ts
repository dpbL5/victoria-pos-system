import { NextRequest } from 'next/server'
import { apiError, apiSuccess, ERR_CSRF, ERR_UNAUTHORIZED, resultToResponse } from '@/lib/infrastructure/api-helpers'
import { repositories } from '@/lib/infrastructure/repositories'
import { createBooking, createBookingSchema, mapBookingError } from '@/lib/bookings'
import { requireAuth, requireMutationAuth } from '@/lib/shared/auth'
import { parseEndOfDay, parseStartOfDay, today } from '@/lib/shared/utils'

export async function GET(request: NextRequest) {
  try {
    await requireAuth()
    const date = request.nextUrl.searchParams.get('date') || today()
    const parsedDate = new Date(`${date}T00:00:00.000Z`)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) {
      return apiError({ code: 'VALIDATION', message: 'Ngày không hợp lệ', status: 400 })
    }
    const rows = await repositories.booking!.findMany({
      from: parseStartOfDay(date),
      to: new Date(parseEndOfDay(date).getTime() + 1),
    })
    return apiSuccess(rows)
  } catch (error) {
    if ((error as Error).message === 'UNAUTHORIZED') return apiError(ERR_UNAUTHORIZED)
    console.error('GET /api/bookings error:', error)
    return apiError({ code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireMutationAuth(request)
    const parsed = createBookingSchema.safeParse(await request.json())
    if (!parsed.success) return apiError({ code: 'VALIDATION', message: parsed.error.issues[0].message, status: 400 })
    return resultToResponse(await createBooking({ ...parsed.data, staffId: auth.userId }), mapBookingError, 201)
  } catch (error) {
    if ((error as Error).message === 'UNAUTHORIZED') return apiError(ERR_UNAUTHORIZED)
    if ((error as Error).message === 'CSRF_MISMATCH') return apiError(ERR_CSRF)
    console.error('POST /api/bookings error:', error)
    return apiError({ code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 })
  }
}
