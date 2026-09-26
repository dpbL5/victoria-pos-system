import type { Prisma } from '@/generated/prisma/client'
import type { BookingRepository } from '@/lib/bookings/ports'

type BookingStore = Pick<Prisma.TransactionClient, 'booking'>

export function createBookingRepository(store: BookingStore): BookingRepository {
  return {
    findMany(input) {
      return store.booking.findMany({
        where: {
          scheduledAt: { gte: input.from, lt: input.to },
          ...(input.statuses ? { status: { in: input.statuses } } : {}),
        },
        include: {
          customer: { select: { id: true, fullName: true, phone: true, type: true } },
          staff: { select: { id: true, fullName: true } },
        },
        orderBy: { scheduledAt: 'asc' },
      })
    },
    findById(id) {
      return store.booking.findUnique({
        where: { id },
        include: {
          customer: { select: { id: true, fullName: true, phone: true, type: true } },
          staff: { select: { id: true, fullName: true } },
        },
      })
    },
    async findForSession(sessionId) {
      const row = await store.booking.findUnique({
        where: { sessionId },
        select: { id: true, depositAmount: true, depositAppliedAmount: true, depositRefundedAmount: true, depositPaymentMethod: true },
      })
      return row && {
        ...row,
        depositAmount: Number(row.depositAmount),
        depositAppliedAmount: Number(row.depositAppliedAmount),
        depositRefundedAmount: Number(row.depositRefundedAmount),
        depositPaymentMethod: row.depositPaymentMethod === 'MEMBER' ? null : row.depositPaymentMethod,
      }
    },
    async create(input) {
      return store.booking.create({ data: input, select: { id: true } })
    },
    async setDepositInvoice(id, invoiceId) {
      await store.booking.update({ where: { id }, data: { depositInvoiceId: invoiceId } })
    },
    async setDepositRefundInvoice(id, invoiceId) {
      await store.booking.update({ where: { id }, data: { depositRefundInvoiceId: invoiceId } })
    },
    updateBooked(id, input) {
      return store.booking.updateMany({ where: { id, status: 'BOOKED' }, data: input })
    },
    transition(id, from, to) {
      return store.booking.updateMany({ where: { id, status: from, depositAmount: 0 }, data: { status: to } })
    },
    markCheckedIn(id, sessionId) {
      return store.booking.updateMany({ where: { id, status: 'BOOKED' }, data: { status: 'CHECKED_IN', sessionId } })
    },
    applyDeposit(id, expectedApplied, amount) {
      return store.booking.updateMany({
        where: { id, depositAppliedAmount: expectedApplied },
        data: { depositAppliedAmount: { increment: amount } },
      })
    },
    reverseDeposit(id, amount) {
      return store.booking.updateMany({
        where: { id, depositAppliedAmount: { gte: amount } },
        data: { depositAppliedAmount: { decrement: amount } },
      })
    },
    applyRefund(id, expectedRefunded, amount) {
      return store.booking.updateMany({
        where: { id, depositRefundedAmount: expectedRefunded },
        data: { depositRefundedAmount: { increment: amount } },
      })
    },
  }
}
