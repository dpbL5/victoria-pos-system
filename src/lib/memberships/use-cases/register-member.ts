// ── Use-case: registerMember — đăng ký hội viên mới (transaction 5 bảng) ─────
import { err, ok } from '@/lib/shared/result'
import type { DomainError, Result } from '@/lib/shared/result'
import { runInTransaction } from '@/lib/infrastructure/db-helpers'
import type { Repositories } from '@/lib/infrastructure/repositories'
import { repositories } from '@/lib/infrastructure/repositories'
import type { HttpErrorInfo } from '@/lib/infrastructure/api-helpers'
import { generateInvoiceNo } from '@/lib/invoicing'
import { calculateRenewalPeriod } from '../helpers'
import type { PaymentMethod } from '@/types'

export interface RegisterMemberInput {
  staffId: string
  fullName: string
  phone?: string | null
  planId: string
  paymentMethod: PaymentMethod
  paidAt?: Date
  notes?: string
}

export interface RegisterMemberResult {
  customer: { id: string; fullName: string; phone: string | null; type: 'MEMBER' }
  membership: { id: string; startsAt: Date; expiresAt: Date; status: 'ACTIVE' | 'CANCELLED' }
  invoiceId: string
  paymentId: string
  membershipPaymentId: string
}

export async function registerMember(
  input: RegisterMemberInput,
  deps: Repositories = repositories
): Promise<Result<RegisterMemberResult>> {
  const { staffId, fullName, phone, planId, paymentMethod, paidAt = new Date(), notes } = input

  // Validation trước transaction → return err
  const [plan, openShift] = await Promise.all([
    deps.membershipPlan.findById(planId),
    deps.shift.findOpenForStaff(staffId),
  ])
  if (!openShift) return err('SHIFT_REQUIRED')
  if (!plan || !plan.isActive) return err('PLAN_NOT_FOUND')

  const { startsAt, expiresAt } = calculateRenewalPeriod(null, plan.durationMonths, paidAt)

  const result = await runInTransaction(async (tx) => {
    const customer = await tx.customer.create({
      fullName,
      phone: phone || null,
      type: 'MEMBER',
    })

    const membership = await tx.membership.create({
      customerId: customer.id,
      planId: plan.id,
      startsAt,
      expiresAt,
      status: 'ACTIVE',
    })

    const invoice = await tx.billing.createPaidInvoice({
      invoiceNo: generateInvoiceNo('MEM'),
      customerId: customer.id,
      shiftId: openShift.id,
      staffId,
      paidAt,
      notes,
      subtotal: Number(plan.price),
      discountTotal: 0,
      grandTotal: Number(plan.price),
      lines: [
        {
          type: 'MEMBERSHIP_FEE',
          description: `Phí hội viên - ${plan.name}`,
          quantity: 1,
          unitPrice: Number(plan.price),
          subtotal: Number(plan.price),
          discountAmount: 0,
          total: Number(plan.price),
          metadata: {
            membershipId: membership.id,
            planId: plan.id,
            startsAt: startsAt.toISOString(),
            expiresAt: expiresAt.toISOString(),
          },
        },
      ],
    })

    const payment = await tx.billing.createPayment({
      invoiceId: invoice.id,
      shiftId: openShift.id,
      staffId,
      totalHours: 0,
      subtotal: Number(plan.price),
      discountTotal: 0,
      grandTotal: Number(plan.price),
      paymentMethod,
      paidAt,
      notes,
    })

    const membershipPayment = await tx.billing.createMembershipPayment({
      customerId: customer.id,
      membershipId: membership.id,
      planId: plan.id,
      invoiceId: invoice.id,
      shiftId: openShift.id,
      staffId,
      amount: Number(plan.price),
      paymentMethod,
      paidAt,
      notes,
    })

    await tx.customer.addSpend(customer.id, Number(plan.price))

    await tx.audit.append({
      userId: staffId,
      action: 'MEMBERSHIP_REGISTER',
      entityType: 'Membership',
      entityId: membership.id,
      details: {
        customerId: customer.id,
        invoiceId: invoice.id,
        paymentId: payment.id,
        membershipPaymentId: membershipPayment.id,
        planId: plan.id,
        startsAt: startsAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
      },
    })

    return { customer, membership, invoiceId: invoice.id, paymentId: payment.id, membershipPaymentId: membershipPayment.id }
  })

  if (!result.ok) return result
  const value = result.value
  return ok({
    customer: {
      id: value.customer.id,
      fullName: value.customer.fullName,
      phone: value.customer.phone,
      type: 'MEMBER',
    },
    membership: value.membership,
    invoiceId: value.invoiceId,
    paymentId: value.paymentId,
    membershipPaymentId: value.membershipPaymentId,
  })
}

export function mapRegisterMemberError(error: DomainError): HttpErrorInfo {
  switch (error.code) {
    case 'SHIFT_REQUIRED':
      return { code: 'SHIFT_REQUIRED', message: 'Cần mở ca trước khi đăng ký hội viên', status: 409 }
    case 'PLAN_NOT_FOUND':
      return { code: 'PLAN_NOT_FOUND', message: 'Gói hội viên không tồn tại hoặc đã ngừng dùng', status: 404 }
    default:
      return { code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 }
  }
}
