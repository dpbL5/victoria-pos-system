// ── Adapter: implement SessionRepository bằng Prisma ─────
import { Prisma } from '@/generated/prisma/client'
import type { SessionStore } from '../store-types'
import type { SessionRepository } from '@/lib/sessions/ports'

export function createSessionRepository(store: SessionStore): SessionRepository {
  return {
    async findByIdForCheckout(id) {
      const session = await store.session.findUnique({
        where: { id },
        include: {
          customer: true,
          membership: true,
          pricingGroups: { orderBy: { createdAt: 'asc' } },
        },
      })
      // SessionWithDetails là payload trực tiếp từ Prisma — sau khi sửa schema,
      // cột customerName đã có sẵn trong model, không cần map tay.
      return session
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

    async findMany(input) {
      const where: Record<string, unknown> = {}
      if (input.status) where.status = input.status
      if (input.customerId) where.customerId = input.customerId
      if (input.date) {
        const dayStart = new Date(input.date)
        const dayEnd = new Date(input.date)
        dayEnd.setDate(dayEnd.getDate() + 1)
        where.createdAt = { gte: dayStart, lt: dayEnd }
      }

      const [rows, total] = await Promise.all([
        store.session.findMany({
          where,
          select: {
            id: true,
            startTime: true,
            endTime: true,
            status: true,
            hourlyRate: true,
            pricingRuleId: true,
            pricingRuleSnapshot: true,
            totalHours: true,
            subtotal: true,
            discountAmount: true,
            totalAmount: true,
            playerCount: true,
            customerName: true,
            pausedAt: true,
            totalPausedSeconds: true,
            promotionRuleId: true,
            promotionName: true,
            promotionDiscountType: true,
            promotionDiscountValue: true,
            customer: { select: { id: true, fullName: true, phone: true, type: true } },
            staff: { select: { id: true, fullName: true } },
            membership: { select: { id: true, startsAt: true, expiresAt: true } },
            shift: { select: { id: true, openedAt: true, status: true } },
            pricingGroups: {
              select: {
                id: true,
                label: true,
                playerCount: true,
                remainingCount: true,
                hourlyRate: true,
                pricingRuleId: true,
                pricingSnapshot: true,
                players: {
                  select: {
                    id: true,
                    name: true,
                    pausedAt: true,
                    totalPausedSeconds: true,
                    checkedOutAt: true,
                    position: true,
                  },
                  orderBy: { position: 'asc' },
                },
              },
              orderBy: { createdAt: 'asc' },
            },
          },
          skip: input.skip,
          take: input.take,
          orderBy: { createdAt: 'desc' },
        }),
        store.session.count({ where }),
      ])
      return { rows, total }
    },

    async findByIdForPreview(id) {
      return store.session.findUnique({
        where: { id },
        select: {
          id: true,
          status: true,
          playerCount: true,
          pricingGroups: {
            select: {
              id: true,
              label: true,
              playerCount: true,
              remainingCount: true,
              hourlyRate: true,
              pricingRuleId: true,
              pricingSnapshot: true,
              players: {
                select: {
                  id: true,
                  name: true,
                  pausedAt: true,
                  totalPausedSeconds: true,
                  checkedOutAt: true,
                  position: true,
                },
                orderBy: { position: 'asc' },
              },
            },
            orderBy: { createdAt: 'asc' },
          },
        },
      })
    },

    async findSellItemTotals(sessionIds) {
      if (sessionIds.length === 0) return {}
      const rows = await store.sessionSellItem.findMany({
        where: { sessionId: { in: sessionIds } },
        select: { sessionId: true, quantity: true, unitPrice: true },
      })
      const totals: Record<string, number> = {}
      for (const r of rows) {
        totals[r.sessionId] = (totals[r.sessionId] ?? 0) + Number(r.quantity) * Number(r.unitPrice)
      }
      return totals
    },

    async findSellItems(sessionId) {
      const rows = await store.sessionSellItem.findMany({
        where: { sessionId },
        orderBy: { createdAt: 'asc' },
      })
      return rows.map((r) => ({
        id: r.id,
        sessionId: r.sessionId,
        productId: r.productId,
        quantity: r.quantity,
        unitPrice: Number(r.unitPrice),
        notes: r.notes,
        createdAt: r.createdAt,
      }))
    },

    async addSellItem(input) {
      // Upsert theo productId trong cùng phiên — nếu đã có thì cộng quantity
      const existing = await store.sessionSellItem.findFirst({
        where: { sessionId: input.sessionId, productId: input.productId },
        select: { id: true },
      })
      if (existing) {
        await store.sessionSellItem.update({
          where: { id: existing.id },
          data: { quantity: { increment: input.quantity }, unitPrice: input.unitPrice },
        })
        return
      }
      await store.sessionSellItem.create({
        data: {
          sessionId: input.sessionId,
          productId: input.productId,
          quantity: input.quantity,
          unitPrice: input.unitPrice,
          notes: input.notes ?? null,
        },
      })
    },

    async removeSellItems(ids) {
      if (ids.length === 0) return
      await store.sessionSellItem.deleteMany({ where: { id: { in: ids } } })
    },

    async clearSellItems(sessionId) {
      await store.sessionSellItem.deleteMany({ where: { sessionId } })
    },

    async createWithRefs(data) {
      return store.session.create({
        data: {
          customerId: data.customerId,
          customerName: data.customerName ?? null,
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

    async countCreatedBetween(from, to) {
      return store.session.count({
        where: { createdAt: { gte: from, lt: to } },
      })
    },

    async createPricingGroup(data) {
      const group = await store.sessionPricingGroup.create({
        data: {
          sessionId: data.sessionId,
          label: data.label,
          playerCount: data.playerCount,
          remainingCount: data.remainingCount,
          hourlyRate: data.hourlyRate,
          pricingRuleId: data.pricingRuleId ?? null,
          pricingSnapshot: (data.pricingSnapshot ?? Prisma.JsonNull) as unknown as Prisma.InputJsonValue,
        },
        select: { id: true },
      })
      return { id: group.id }
    },

    async createPlayersForGroup(sessionId, groupId, count) {
      if (count <= 0) return
      // Gán tên cố định "Người N" + position tăng dần ngay khi tạo.
      // `position` là sort key ổn định — không phụ thuộc createdAt/CTID, không
      // đổi sau UPDATE (renamePlayer chỉ sửa `name`). UI fallback theo `position`
      // để hiển thị tên khi name rỗng.
      await store.sessionPlayer.createMany({
        data: Array.from({ length: count }, (_, i) => ({
          sessionId,
          groupId,
          name: `Người ${i + 1}`,
          pausedAt: null,
          totalPausedSeconds: 0,
          position: i,
        })),
      })
    },

    async movePlayersToGroup(playerIds, groupId) {
      if (playerIds.length === 0) return
      await store.sessionPlayer.updateMany({
        where: { id: { in: playerIds } },
        data: { groupId },
      })
    },

    async updatePricingGroup(groupId, data) {
      await store.sessionPricingGroup.update({
        where: { id: groupId },
        data: {
          ...(data.label !== undefined ? { label: data.label } : {}),
          ...(data.playerCount !== undefined ? { playerCount: data.playerCount } : {}),
          ...(data.remainingCount !== undefined ? { remainingCount: data.remainingCount } : {}),
          ...(data.hourlyRate !== undefined ? { hourlyRate: data.hourlyRate } : {}),
          ...(data.pricingRuleId !== undefined ? { pricingRuleId: data.pricingRuleId } : {}),
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

    async findByIdWithPlayers(id) {
      return store.session.findUnique({
        where: { id },
        include: {
          customer: true,
          membership: true,
          pricingGroups: {
            orderBy: { createdAt: 'asc' },
            include: {
              players: { orderBy: { position: 'asc' } },
            },
          },
        },
      })
    },

    // Chỉ đọc status + players — tránh tải customer/membership nặng cho pause/resume
    async findPlayersForPause(id) {
      return store.session.findUnique({
        where: { id },
        select: {
          id: true,
          status: true,
          playerCount: true,
          totalPausedSeconds: true,
          pausedAt: true,
          pricingGroups: {
            select: {
              id: true,
              players: {
                select: { id: true, pausedAt: true, totalPausedSeconds: true, position: true },
                orderBy: { position: 'asc' },
              },
            },
          },
        },
      })
    },

    async pausePlayer(playerId, pausedAt) {
      await store.sessionPlayer.update({
        where: { id: playerId },
        data: { pausedAt },
      })
    },

    async resumePlayer(playerId, pausedSeconds) {
      await store.sessionPlayer.update({
        where: { id: playerId },
        data: { pausedAt: null, totalPausedSeconds: { increment: pausedSeconds } },
      })
    },

    async pausePlayersForSession(sessionId, pausedAt) {
      await store.sessionPlayer.updateMany({
        where: { sessionId, checkedOutAt: null },
        data: { pausedAt },
      })
    },

    async resumePlayersForSession(sessionId, pausedSeconds) {
      await store.sessionPlayer.updateMany({
        where: { sessionId, checkedOutAt: null },
        data: { pausedAt: null, totalPausedSeconds: { increment: pausedSeconds } },
      })
    },

    async renamePlayer(playerId, name) {
      await store.sessionPlayer.update({
        where: { id: playerId },
        data: { name },
      })
    },

    async markPlayersCheckedOut(playerIds, checkedOutAt) {
      if (playerIds.length === 0) return
      await store.sessionPlayer.updateMany({
        where: { id: { in: playerIds } },
        data: { checkedOutAt },
      })
    },
  }
}
