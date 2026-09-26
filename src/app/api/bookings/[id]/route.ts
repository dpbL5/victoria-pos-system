import { NextRequest } from 'next/server'
import { apiError, apiSuccess, ERR_CSRF, ERR_UNAUTHORIZED, resultToResponse } from '@/lib/infrastructure/api-helpers'
import { repositories } from '@/lib/infrastructure/repositories'
import { bookingStatusSchema, mapBookingError, setBookingStatus, updateBooking, updateBookingSchema } from '@/lib/bookings'
import { checkInBooking } from '@/lib/sessions'
import { requireAuth, requireMutationAuth } from '@/lib/shared/auth'

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth()
    const { id } = await params
    const booking = await repositories.booking!.findById(id)
    if (!booking) return apiError({ code: 'BOOKING_NOT_FOUND', message: 'Không tìm thấy lịch đặt', status: 404 })
    return apiSuccess(booking)
  } catch (error) {
    if ((error as Error).message === 'UNAUTHORIZED') return apiError(ERR_UNAUTHORIZED)
    return apiError({ code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireMutationAuth(request)
    const { id } = await params
    const body = await request.json()
    if (body.action === 'check-in') {
      return resultToResponse(await checkInBooking({ bookingId: id, staffId: auth.userId }), mapBookingError)
    }
    const status = bookingStatusSchema.safeParse(body)
    if (status.success) {
      return resultToResponse(await setBookingStatus({ bookingId: id, staffId: auth.userId, status: status.data.status }), mapBookingError)
    }
    const parsed = updateBookingSchema.safeParse(body)
    if (!parsed.success) return apiError({ code: 'VALIDATION', message: parsed.error.issues[0].message, status: 400 })
    return resultToResponse(await updateBooking({ ...parsed.data, bookingId: id, staffId: auth.userId }), mapBookingError)
  } catch (error) {
    if ((error as Error).message === 'UNAUTHORIZED') return apiError(ERR_UNAUTHORIZED)
    if ((error as Error).message === 'CSRF_MISMATCH') return apiError(ERR_CSRF)
    console.error('PATCH /api/bookings/[id] error:', error)
    return apiError({ code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 })
  }
}
