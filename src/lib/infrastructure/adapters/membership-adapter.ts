// ── Adapter: implement membership/customer repositories bằng Prisma ─────
import type { CustomerStore, MembershipStore } from '../store-types'
import { findActiveMembership, findLatestMembership } from '@/lib/memberships/helpers'
import type {
  CustomerRepository,
  MembershipPlanRepository,
  MembershipRepository,
} from '@/lib/memberships/ports'

export function createMembershipRepository(store: MembershipStore): MembershipRepository {
  return {
    findLatest: (customerId) => findLatestMembership(store, customerId),
    findActive: (customerId, at) => findActiveMembership(store, customerId, at),
    async create(data) {
      return store.membership.create({ data, include: { plan: true } })
    },
  }
}

export function createMembershipPlanRepository(store: MembershipStore): MembershipPlanRepository {
  return {
    async findById(id) {
      const plan = await store.membershipPlan.findUnique({ where: { id } })
      return plan
    },
  }
}

export function createCustomerRepository(store: CustomerStore): CustomerRepository {
  return {
    findById: (id) => store.customer.findUnique({ where: { id } }),
    async create(data) {
      return store.customer.create({ data })
    },
    async addSpend(customerId, amount, setTypeMember = false) {
      await store.customer.update({
        where: { id: customerId },
        data: {
          ...(setTypeMember ? { type: 'MEMBER' } : {}),
          totalSpent: { increment: amount },
        },
      })
    },

    async recordPlay(customerId, input) {
      await store.customer.update({
        where: { id: customerId },
        data: {
          totalHoursPlayed: { increment: input.hours },
          totalSpent: { increment: input.spent },
        },
      })
    },

    async countWalkInsBetween(from, to) {
      return store.customer.count({
        where: {
          type: 'WALK_IN',
          phone: null,
          createdAt: { gte: from, lt: to },
        },
      })
    },
  }
}
