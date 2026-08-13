// ── Use-case: renewMembership — gia hạn hội viên ─────
import { err, ok } from '@/lib/shared/result'
import type { DomainError, Result } from '@/lib/shared/result'
import { runInTransaction } from '@/lib/infrastructure/db-helpers'
import type { Repositories } from '@/lib/infrastructure/repositories'
import { repositories } from '@/lib/infrastructure/repositories'
import type { HttpErrorInfo } from '@/lib/infrastructure/api-helpers'
import { generateInvoiceNo } from '@/lib/invoicing'
import { calculateRenewalPeriod } from '../helpers'
import type { PaymentMethod } from '@/types'

export interface RenewMembershipInput {
  staffId: string
  customerId: string
  planId: string
  paymentMethod: PaymentMethod
  paidAt?: Date
  notes?: string
}

export interface RenewMembershipResult {
  membershipId: string
  invoiceId: string
  membershipPaymentId: string
  startsAt: Date
  expiresAt: Date
}

export async function renewMembership(
  input: RenewMembershipInput,
  deps: Repositories = repositories
): Promise<Result<RenewMembershipResult>> {
  const { staffId, customerId, planId, paymentMethod, paidAt = new Date(), notes } = input

  // Validation trước transaction → return err
  const [customer, plan, latestMembership, openShift] = await Promise.all([
    deps.customer.findById(customerId),
    deps.membershipPlan.findById(planId),
    deps.membership.findLatest(customerId),
    deps.shift.findOpenForStaff(staffId),
  ])

  if (!customer) return err('CUSTOMER_NOT_FOUND')
  if (!openShift) return err('SHIFT_REQUIRED')
  if (!plan || !plan.isActive) return err('PLAN_NOT_FOUND')

  const { startsAt, expiresAt } = calculateRenewalPeriod(
    latestMembership,
    plan.durationMonths,
    paidAt
  )

  const result = await runInTransaction(async (tx) => {
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

    // Gia hạn: đổi khách sang MEMBER + cộng chi tiêu
    await tx.customer.addSpend(customer.id, Number(plan.price), true)

    await tx.audit.append({
      userId: staffId,
      action: 'MEMBERSHIP_RENEW',
      entityType: 'Membership',
      entityId: membership.id,
      details: {
        customerId: customer.id,
        invoiceId: invoice.id,
        membershipPaymentId: membershipPayment.id,
        planId: plan.id,
        startsAt: startsAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
      },
    })

    return { membershipId: membership.id, invoiceId: invoice.id, membershipPaymentId: membershipPayment.id }
  })

  if (!result.ok) return result
  const value = result.value
  return ok({
    ...value,
    startsAt,
    expiresAt,
  })
}

export function mapRenewMembershipError(error: DomainError): HttpErrorInfo {
  switch (error.code) {
    case 'CUSTOMER_NOT_FOUND':
      return { code: 'CUSTOMER_NOT_FOUND', message: 'Không tìm thấy khách hàng', status: 404 }
    case 'SHIFT_REQUIRED':
      return { code: 'SHIFT_REQUIRED', message: 'Cần mở ca trước khi gia hạn hội viên', status: 409 }
    case 'PLAN_NOT_FOUND':
      return { code: 'PLAN_NOT_FOUND', message: 'Gói hội viên không tồn tại hoặc đã ngừng dùng', status: 404 }
    default:
      return { code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 }
  }
}
