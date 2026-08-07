// ── Adapter: implement AuditRepository bằng Prisma ─────
import type { AuditStore } from '../store-types'
import { logActivity } from '@/lib/audit'
import type { AuditRepository } from '@/lib/audit'

export function createAuditRepository(store: AuditStore): AuditRepository {
  return {
    async append(input) {
      await logActivity(store, input)
    },
  }
}
