import type { Prisma } from '@/generated/prisma/client'

export type BookingRow = Prisma.BookingGetPayload<{
  include: {
    customer: { select: { id: true; fullName: true; phone: true; type: true } }
    staff: { select: { id: true; fullName: true } }
  }
}>

export interface BookingRepository {
  findMany(input: { from: Date; to: Date; statuses?: Array<'BOOKED' | 'CHECKED_IN' | 'CANCELLED'> }): Promise<BookingRow[]>
  findById(id: string): Promise<BookingRow | null>
  findForSession(sessionId: string): Promise<{
    id: string
    depositAmount: number
    depositAppliedAmount: number
    depositRefundedAmount: number
    depositPaymentMethod: 'CASH' | 'TRANSFER' | 'CARD' | null
  } | null>
  create(input: {
    customerId: string | null
    customerName: string | null
    customerPhone: string | null
    scheduledAt: Date
    playerCount: number
    depositAmount: number
    depositPaymentMethod: 'CASH' | 'TRANSFER' | 'CARD' | null
    staffId: string
    notes: string | null
  }): Promise<{ id: string }>
  setDepositInvoice(id: string, invoiceId: string): Promise<void>
  setDepositRefundInvoice(id: string, invoiceId: string): Promise<void>
  updateBooked(id: string, input: {
    scheduledAt?: Date
    playerCount?: number
    customerId?: string | null
    customerName?: string | null
    customerPhone?: string | null
    notes?: string | null
  }): Promise<{ count: number }>
  transition(id: string, from: 'BOOKED', to: 'CANCELLED', allowDeposit?: boolean): Promise<{ count: number }>
  markCheckedIn(id: string, sessionId: string): Promise<{ count: number }>
  applyDeposit(id: string, expectedApplied: number, amount: number): Promise<{ count: number }>
  reverseDeposit(id: string, amount: number): Promise<{ count: number }>
  applyRefund(id: string, expectedRefunded: number, amount: number): Promise<{ count: number }>
}
