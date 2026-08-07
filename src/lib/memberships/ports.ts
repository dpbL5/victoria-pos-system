// ── Ports — repository interfaces cho domain memberships ─────
import type { Prisma } from '@/generated/prisma/client'

export type MembershipWithPlan = Prisma.MembershipGetPayload<{ include: { plan: true } }>
export type PlanRecord = Prisma.MembershipPlanGetPayload<object>
export type CustomerRecord = Prisma.CustomerGetPayload<object>

export interface MembershipRepository {
  /** Membership ACTIVE mới nhất của khách hàng (không filter thời gian) */
  findLatest(customerId: string): Promise<MembershipWithPlan | null>
  /** Membership còn hiệu lực tại thời điểm `at` */
  findActive(customerId: string, at: Date): Promise<MembershipWithPlan | null>
  create(data: {
    customerId: string
    planId: string
    startsAt: Date
    expiresAt: Date
    status: 'ACTIVE'
  }): Promise<MembershipWithPlan>
}

export interface MembershipPlanRepository {
  findById(id: string): Promise<PlanRecord | null>
}

export interface CustomerRepository {
  findById(id: string): Promise<CustomerRecord | null>
  create(data: {
    fullName: string
    phone?: string | null
    type: 'MEMBER' | 'WALK_IN'
  }): Promise<CustomerRecord>
  /** Cộng totalSpent; setTypeMember = true cũng đổi type sang MEMBER (khi gia hạn) */
  addSpend(customerId: string, amount: number, setTypeMember?: boolean): Promise<void>
  /** Cộng totalHoursPlayed + totalSpent (sau checkout) */
  recordPlay(customerId: string, input: { hours: number; spent: number }): Promise<void>
  /** Đếm khách vãng lai tạo trong khoảng thời gian (đặt tên khách #001...) */
  countWalkInsBetween(from: Date, to: Date): Promise<number>
}
