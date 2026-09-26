import { fail, runInTransaction } from '@/lib/infrastructure/db-helpers'
import type { Repositories } from '@/lib/infrastructure/repositories'
import { repositories } from '@/lib/infrastructure/repositories'
import { err } from '@/lib/shared/result'
import { runCheckInTx } from './check-in'

export async function checkInBooking(
  input: { bookingId: string; staffId: string },
  deps: Repositories = repositories
) {
  const booking = await deps.booking!.findById(input.bookingId)
  if (!booking) return err('BOOKING_NOT_FOUND')
  if (booking.status !== 'BOOKED') return err('BOOKING_NOT_EDITABLE')

  let membershipId: string | undefined
  if (booking.customerId) {
    const customer = await deps.customer.findById(booking.customerId)
    if (!customer) return err('CUSTOMER_NOT_FOUND')
    if (customer.type === 'MEMBER') {
      const membership = await deps.membership.findActive(customer.id, new Date())
      if (!membership) return err('MEMBERSHIP_REQUIRED')
      membershipId = membership.id
    }
  }

  try {
    return await runInTransaction(async (tx) => {
      if (booking.customerId && await tx.session.findActiveByCustomer(booking.customerId)) {
        fail('ACTIVE_SESSION_EXISTS')
      }
      if (booking.customerId && membershipId) {
        const activeMembership = await tx.membership.findActive(booking.customerId, new Date())
        if (!activeMembership) fail('MEMBERSHIP_REQUIRED')
        membershipId = activeMembership.id
      }
      const session = await runCheckInTx(tx, {
        staffId: input.staffId,
        customerId: booking.customerId,
        customerName: booking.customerId ? null : booking.customerName,
        customerPhone: booking.customerId ? null : booking.customerPhone,
        playerCount: booking.playerCount,
        now: new Date(),
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
        details: { sessionId: session.id },
      })
      return session
    }, { isolationLevel: 'Serializable' })
  } catch (error) {
    if ((error as { code?: string }).code === 'P2034') return err('ACTIVE_SESSION_EXISTS')
    throw error
  }
}
