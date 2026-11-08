import { NextRequest } from 'next/server'
import { z } from 'zod'
import { apiError, apiSuccess, ERR_CSRF, ERR_UNAUTHORIZED, resultToResponse } from '@/lib/infrastructure/api-helpers'
import { repositories } from '@/lib/infrastructure/repositories'
import { bookingStatusSchema, mapBookingError, setBookingStatus, updateBooking, updateBookingSchema } from '@/lib/bookings'
import { checkInBooking } from '@/lib/sessions'
import { requireAuth, requireMutationAuth, userHasPermission } from '@/lib/shared/auth'

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth()
    if (!userHasPermission(auth, 'bookings.view')) {
      return apiError({ code: 'FORBIDDEN', message: 'Bạn không có quyền xem lịch đặt', status: 403 })
    }
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
      if (!userHasPermission(auth, 'bookings.confirm')) {
        return apiError({ code: 'FORBIDDEN', message: 'Bạn không có quyền xác nhận lịch đặt', status: 403 })
      }
      const parsed = z.object({
        action: z.literal('check-in'),
        startTime: z.string().datetime('Thời điểm check-in không hợp lệ').optional(),
        playerCount: z.number().int().min(1, 'Số người chơi tối thiểu là 1').max(50, 'Số người chơi tối đa là 50').optional(),
      }).safeParse(body)
      if (!parsed.success) return apiError({ code: 'VALIDATION', message: parsed.error.issues[0].message, status: 400 })
      return resultToResponse(await checkInBooking({
        bookingId: id,
        staffId: auth.userId,
        startTime: parsed.data.startTime ? new Date(parsed.data.startTime) : undefined,
        playerCount: parsed.data.playerCount,
      }), mapBookingError)
    }
    const status = bookingStatusSchema.safeParse(body)
    if (status.success) {
      const needed = status.data.status === 'CANCELLED' ? 'bookings.cancel' : 'bookings.confirm'
      if (!userHasPermission(auth, needed)) {
        return apiError({ code: 'FORBIDDEN', message: 'Bạn không có quyền cập nhật trạng thái lịch đặt', status: 403 })
      }
      return resultToResponse(await setBookingStatus({ bookingId: id, staffId: auth.userId, status: status.data.status }), mapBookingError)
    }
    if (!userHasPermission(auth, 'bookings.create')) {
      return apiError({ code: 'FORBIDDEN', message: 'Bạn không có quyền sửa lịch đặt', status: 403 })
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
