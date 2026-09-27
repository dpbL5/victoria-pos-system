import { fail, runInTransaction } from '@/lib/infrastructure/db-helpers'
import type { Repositories } from '@/lib/infrastructure/repositories'
import { repositories } from '@/lib/infrastructure/repositories'
import { err } from '@/lib/shared/result'
import { runCheckInTx } from './check-in'

export async function checkInBooking(
  input: { bookingId: string; staffId: string; startTime?: Date },
  deps: Repositories = repositories
) {
  const checkInAt = input.startTime ?? new Date()
  if (Number.isNaN(checkInAt.getTime())) return err('CHECK_IN_TIME_INVALID')

  const booking = await deps.booking!.findById(input.bookingId)
  if (!booking) return err('BOOKING_NOT_FOUND')
  if (booking.status !== 'BOOKED') return err('BOOKING_NOT_EDITABLE')

  let membershipId: string | undefined
  if (booking.customerId) {
    const customer = await deps.customer.findById(booking.customerId)
    if (!customer) return err('CUSTOMER_NOT_FOUND')
    if (customer.type === 'MEMBER') {
      const membership = await deps.membership.findActive(customer.id, checkInAt)
      if (!membership) return err('MEMBERSHIP_REQUIRED')
      membershipId = membership.id
    }
  }

  try {
    return await runInTransaction(async (tx) => {
      const openShift = await tx.shift.findOpenForStaff(input.staffId)
      if (!openShift) fail('SHIFT_REQUIRED')
      if (checkInAt < openShift.openedAt || checkInAt > new Date()) fail('CHECK_IN_TIME_INVALID')

      if (booking.customerId && await tx.session.findActiveByCustomer(booking.customerId)) {
        fail('ACTIVE_SESSION_EXISTS')
      }
      if (booking.customerId && membershipId) {
        const activeMembership = await tx.membership.findActive(booking.customerId, checkInAt)
        if (!activeMembership) fail('MEMBERSHIP_REQUIRED')
        membershipId = activeMembership.id
      }
      const session = await runCheckInTx(tx, {
        staffId: input.staffId,
        customerId: booking.customerId,
        customerName: booking.customerId ? null : booking.customerName,
        customerPhone: booking.customerId ? null : booking.customerPhone,
        playerCount: booking.playerCount,
        now: checkInAt,
        membershipId,
        totalPlayers: booking.playerCount,
      })
      const changed = await tx.booking!.markCheckedIn(booking.id, session.id)
      if (!changed.count) fail('BOOKING_NOT_EDITABLE')
      await tx.audit.append({
        userId: input.staffId,
        action: 'BOOKING_CHECK_IN',
        entityType: 'Booking',
        entityId: booking.id,
        details: { sessionId: session.id, startTime: checkInAt.toISOString() },
      })
      return session
    }, { isolationLevel: 'Serializable' })
  } catch (error) {
    if ((error as { code?: string }).code === 'P2034') return err('ACTIVE_SESSION_EXISTS')
    throw error
  }
}
