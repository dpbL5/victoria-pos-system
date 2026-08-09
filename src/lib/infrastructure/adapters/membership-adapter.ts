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
    async findManyByCustomer(customerId) {
      return store.membership.findMany({
        where: customerId ? { customerId } : {},
        include: {
          customer: { select: { id: true, fullName: true, phone: true, type: true } },
          plan: true,
        },
        orderBy: { startsAt: 'desc' },
      })
    },
  }
}

export function createMembershipPlanRepository(store: MembershipStore): MembershipPlanRepository {
  return {
    async findById(id) {
      const plan = await store.membershipPlan.findUnique({ where: { id } })
      return plan
    },
    async findMany() {
      return store.membershipPlan.findMany({
        orderBy: [{ isActive: 'desc' }, { price: 'asc' }],
      })
    },
    async create(data) {
      return store.membershipPlan.create({ data })
    },
    async update(id, data) {
      return store.membershipPlan.update({ where: { id }, data })
    },
    async countUsage(planId) {
      return store.membership.count({ where: { planId } })
    },
    async delete(id) {
      await store.membershipPlan.delete({ where: { id } })
    },
  }
}

export function createCustomerRepository(store: CustomerStore): CustomerRepository {
  return {
    findById: (id) => store.customer.findUnique({ where: { id } }),
    async findByIdWithCount(id) {
      return store.customer.findUnique({
        where: { id },
        select: {
          id: true,
          fullName: true,
          phone: true,
          type: true,
          totalHoursPlayed: true,
          totalSpent: true,
          notes: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { sessions: true } },
        },
      })
    },
    async create(data) {
      return store.customer.create({ data })
    },
    async findMany(input) {
      const where: Record<string, unknown> = {}
      if (input.search) {
        where.OR = [
          { fullName: { contains: input.search, mode: 'insensitive' } },
          { phone: { contains: input.search } },
        ]
      }
      if (input.type) where.type = input.type

      const [rows, total] = await Promise.all([
        store.customer.findMany({
          where,
          select: {
            id: true,
            fullName: true,
            phone: true,
            type: true,
            totalHoursPlayed: true,
            totalSpent: true,
            createdAt: true,
            updatedAt: true,
            // notes intentionally excluded from list view — may contain PII
          },
          skip: input.skip,
          take: input.take,
          orderBy: { createdAt: 'desc' },
        }),
        store.customer.count({ where }),
      ])
      return { rows, total }
    },
    async update(id, data) {
      return store.customer.update({ where: { id }, data })
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
