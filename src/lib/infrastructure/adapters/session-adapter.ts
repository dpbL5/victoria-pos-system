// ── Adapter: implement SessionRepository bằng Prisma ─────
import { Prisma } from '@/generated/prisma/client'
import type { SessionStore } from '../store-types'
import type { SessionRepository } from '@/lib/sessions/ports'

export function createSessionRepository(store: SessionStore): SessionRepository {
  return {
    async findByIdForCheckout(id) {
      return store.session.findUnique({
        where: { id },
        include: {
          customer: true,
          membership: true,
          pricingGroups: { orderBy: { createdAt: 'asc' } },
        },
      })
    },

    async findByIdWithCustomer(id) {
      return store.session.findUnique({
        where: { id },
        include: { customer: true },
      })
    },

    findActiveByCustomer: (customerId) =>
      store.session.findFirst({
        where: { customerId, status: 'ACTIVE' },
        select: { id: true },
      }),

    async createWithRefs(data) {
      return store.session.create({
        data: {
          customerId: data.customerId,
          staffId: data.staffId,
          shiftId: data.shiftId,
          membershipId: data.membershipId,
          startTime: data.startTime,
          hourlyRate: data.hourlyRate,
          pricingRuleId: data.pricingRuleId,
          pricingRuleSnapshot: (data.pricingRuleSnapshot ?? Prisma.JsonNull) as unknown as Prisma.InputJsonValue,
          playerCount: data.playerCount,
          status: 'ACTIVE',
        },
        include: {
          customer: { select: { id: true, fullName: true, type: true } },
          membership: { select: { id: true, startsAt: true, expiresAt: true } },
          shift: { select: { id: true, openedAt: true, status: true } },
        },
      })
    },

    async createPricingGroup(data) {
      await store.sessionPricingGroup.create({
        data: {
          sessionId: data.sessionId,
          label: data.label,
          playerCount: data.playerCount,
          remainingCount: data.remainingCount,
          hourlyRate: data.hourlyRate,
          pricingRuleId: data.pricingRuleId ?? null,
          pricingSnapshot: (data.pricingSnapshot ?? Prisma.JsonNull) as unknown as Prisma.InputJsonValue,
        },
      })
    },

    async update(id, data) {
      await store.session.update({ where: { id }, data })
    },

    async decrementGroupRemaining(groupId, count) {
      return store.sessionPricingGroup.update({
        where: { id: groupId },
        data: { remainingCount: { decrement: count } },
        select: { remainingCount: true },
      })
    },

    async sumRemainingPlayers(sessionId) {
      const groups = await store.sessionPricingGroup.findMany({
        where: { sessionId },
        select: { remainingCount: true },
      })
      return groups.reduce((sum, g) => sum + g.remainingCount, 0)
    },
  }
}
