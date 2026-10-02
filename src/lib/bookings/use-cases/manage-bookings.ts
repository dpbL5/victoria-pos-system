import type { HttpErrorInfo } from '@/lib/infrastructure/api-helpers'
import { fail, runInTransaction } from '@/lib/infrastructure/db-helpers'
import type { Repositories } from '@/lib/infrastructure/repositories'
import { repositories } from '@/lib/infrastructure/repositories'
import { err, ok } from '@/lib/shared/result'
import type { DomainError, Result } from '@/lib/shared/result'
import { parseStartOfDay, toInputDate } from '@/lib/shared/utils'
import type { CreateBookingInput, UpdateBookingInput } from '../validations'

export async function createBooking(
  input: CreateBookingInput & { staffId: string },
  deps: Repositories = repositories
): Promise<Result<{ id: string; depositInvoiceId: string | null }>> {
  const customer = input.customerId ? await deps.customer.findById(input.customerId) : null
  if (input.customerId && !customer) return err('CUSTOMER_NOT_FOUND')
  if (new Date(input.scheduledAt) <= new Date()) return err('BOOKING_TIME_INVALID')
  const depositAmount = input.depositAmount
  const depositPaymentMethod = input.depositPaymentMethod

  const result = await runInTransaction(async (tx) => {
    const booking = await tx.booking!.create({
      customerId: customer?.id ?? null,
      customerName: customer ? null : (input.customerName?.trim() || null),
      customerPhone: customer ? null : (input.customerPhone?.trim() || null),
      scheduledAt: new Date(input.scheduledAt),
      playerCount: input.playerCount,
      depositAmount,
      depositPaymentMethod: depositAmount > 0 ? depositPaymentMethod! : null,
      staffId: input.staffId,
      notes: input.notes?.trim() || null,
    })

    await tx.audit.append({
      userId: input.staffId,
      action: 'BOOKING_CREATE',
      entityType: 'Booking',
      entityId: booking.id,
      details: {
        customerId: customer?.id ?? null,
        scheduledAt: input.scheduledAt,
        playerCount: input.playerCount,
        depositAmount,
      },
    })
    return { id: booking.id, depositInvoiceId: null }
  })

  return result.ok ? ok(result.value) : result
}

export async function updateBooking(
  input: UpdateBookingInput & { bookingId: string; staffId: string },
  deps: Repositories = repositories
): Promise<Result<{ id: string }>> {
  const booking = await deps.booking!.findById(input.bookingId)
  if (!booking) return err('BOOKING_NOT_FOUND')
  if (booking.status !== 'BOOKED') return err('BOOKING_NOT_EDITABLE')
  if (input.scheduledAt && new Date(input.scheduledAt) <= new Date()) return err('BOOKING_TIME_INVALID')
  if (input.customerId) {
    const customer = await deps.customer.findById(input.customerId)
    if (!customer) return err('CUSTOMER_NOT_FOUND')
  }
  const updated = await runInTransaction(async (tx) => {
    const result = await tx.booking!.updateBooked(input.bookingId, {
      ...(input.scheduledAt !== undefined ? { scheduledAt: new Date(input.scheduledAt) } : {}),
      ...(input.playerCount !== undefined ? { playerCount: input.playerCount } : {}),
      ...(input.customerId !== undefined ? { customerId: input.customerId } : {}),
      ...(input.customerName !== undefined ? { customerName: input.customerName?.trim() || null } : {}),
      ...(input.customerPhone !== undefined ? { customerPhone: input.customerPhone?.trim() || null } : {}),
      ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
    })
    if (!result.count) fail('BOOKING_NOT_EDITABLE')
    await tx.audit.append({ userId: input.staffId, action: 'BOOKING_UPDATE', entityType: 'Booking', entityId: input.bookingId, details: input })
    return { id: input.bookingId }
  })
  return updated.ok ? ok(updated.value) : updated
}

export async function setBookingStatus(
  input: { bookingId: string; staffId: string; status: 'CANCELLED'; depositRefunded?: boolean },
  deps: Repositories = repositories
): Promise<Result<{ id: string; status: 'CANCELLED' }>> {
  const booking = await deps.booking!.findById(input.bookingId)
  if (!booking) return err('BOOKING_NOT_FOUND')
  const depositRemaining = Number(booking.depositAmount) - Number(booking.depositAppliedAmount) - Number(booking.depositRefundedAmount)
  // Cọc chỉ bỏ qua được khi lịch đã quá giờ hẹn VÀ nhân viên xác nhận đã hoàn
  // tiền mặt cho khách ngoài hệ thống — không tạo hoá đơn cọc/hoàn cọc.
  const externalRefund = depositRemaining > 0
    && new Date(booking.scheduledAt).getTime() < Date.now()
    && input.depositRefunded === true
  if (depositRemaining > 0 && !externalRefund) return err('BOOKING_HAS_DEPOSIT')
  const result = await runInTransaction(async (tx) => {
    const updated = await tx.booking!.transition(input.bookingId, 'BOOKED', input.status, externalRefund)
    if (!updated.count) fail('BOOKING_NOT_EDITABLE')
    await tx.audit.append({
      userId: input.staffId,
      action: `BOOKING_${input.status}`,
      entityType: 'Booking',
      entityId: input.bookingId,
      details: externalRefund
        ? { depositRefundedExternally: depositRemaining, depositPaymentMethod: booking.depositPaymentMethod }
        : {},
    })
    return { id: input.bookingId, status: input.status }
  })
  return result.ok ? ok(result.value) : result
}

/**
 * Tự động huỷ lịch quá ngày (no-show): lịch còn BOOKED với giờ hẹn trước 00:00
 * hôm nay (giờ VN) chuyển thành CANCELLED. Lịch còn tiền cọc chưa xử lý giữ
 * nguyên để nhân viên xác nhận hoàn cọc qua luồng huỷ thường.
 */
export async function autoCancelStaleBookings(
  input: { actorId: string; now?: Date },
  deps: Repositories = repositories
): Promise<Result<{ cancelled: number }>> {
  const cutoff = parseStartOfDay(toInputDate(input.now ?? new Date()))
  const stale = await deps.booking!.findMany({ from: new Date(0), to: cutoff, statuses: ['BOOKED'] })
  const cancellable = stale.filter((booking) =>
    Number(booking.depositAmount) - Number(booking.depositAppliedAmount) - Number(booking.depositRefundedAmount) <= 0
  )
  if (!cancellable.length) return ok({ cancelled: 0 })

  const result = await runInTransaction(async (tx) => {
    let cancelled = 0
    for (const booking of cancellable) {
      const updated = await tx.booking!.transition(booking.id, 'BOOKED', 'CANCELLED')
      if (!updated.count) continue
      cancelled += 1
      await tx.audit.append({
        userId: input.actorId,
        action: 'BOOKING_CANCELLED',
        entityType: 'Booking',
        entityId: booking.id,
        details: { autoCancelled: true, scheduledAt: booking.scheduledAt.toISOString() },
      })
    }
    return { cancelled }
  })
  return result.ok ? ok(result.value) : result
}

export function mapBookingError(error: DomainError): HttpErrorInfo {
  switch (error.code) {
    case 'BOOKING_NOT_FOUND': return { code: error.code, message: 'Không tìm thấy lịch đặt', status: 404 }
    case 'BOOKING_TIME_INVALID': return { code: error.code, message: 'Giờ hẹn phải ở tương lai', status: 400 }
    case 'BOOKING_NOT_EDITABLE': return { code: error.code, message: 'Lịch này đã được xử lý hoặc không còn chỉnh sửa được', status: 409 }
    case 'BOOKING_HAS_DEPOSIT': return { code: error.code, message: 'Lịch đã thu cọc, vui lòng xử lý cọc trước khi hủy', status: 409 }
    case 'CUSTOMER_NOT_FOUND': return { code: error.code, message: 'Không tìm thấy khách hàng', status: 404 }
    case 'ACTIVE_SESSION_EXISTS': return { code: error.code, message: 'Khách đang có phiên chơi chưa kết thúc', status: 409 }
    case 'MEMBERSHIP_REQUIRED': return { code: error.code, message: 'Hội viên chưa có gói còn hiệu lực. Vui lòng gia hạn trước khi check-in.', status: 409 }
    case 'SHIFT_REQUIRED': return { code: error.code, message: 'Mở ca trước khi xác nhận khách bắt đầu phiên', status: 409 }
    case 'CHECK_IN_TIME_INVALID': return { code: error.code, message: 'Thời điểm check-in phải nằm từ lúc mở ca đến hiện tại', status: 400 }
    default: return { code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 }
  }
}
