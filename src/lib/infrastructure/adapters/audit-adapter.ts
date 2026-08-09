// ── Adapter: implement AuditRepository bằng Prisma ─────
import type { AuditStore } from '../store-types'
import { logActivity } from '@/lib/audit'
import type { AuditRepository } from '@/lib/audit'

export function createAuditRepository(store: AuditStore): AuditRepository {
  return {
    async append(input) {
      await logActivity(store, input)
    },

    async findMany(input) {
      const where: Record<string, unknown> = {}
      if (input.userId) where.userId = input.userId
      if (input.action) where.action = input.action
      if (input.entityType) where.entityType = input.entityType
      if (input.search) {
        where.OR = [
          { action: { contains: input.search, mode: 'insensitive' } },
          { entityType: { contains: input.search, mode: 'insensitive' } },
          { user: { fullName: { contains: input.search, mode: 'insensitive' } } },
          { user: { username: { contains: input.search, mode: 'insensitive' } } },
        ]
      }

      const [rows, total] = await Promise.all([
        store.activityLog.findMany({
          where,
          select: {
            id: true,
            userId: true,
            action: true,
            entityType: true,
            entityId: true,
            details: true,
            createdAt: true,
            user: { select: { id: true, username: true, fullName: true, role: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: input.take,
        }),
        store.activityLog.count({ where }),
      ])
      return { rows, total }
    },
  }
}
