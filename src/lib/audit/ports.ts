// ── Ports — repository interface cho domain audit ─────
import type { Prisma } from '@/generated/prisma/client'

export interface AuditLogInput {
  userId: string
  action: string
  entityType: string
  entityId: string
  details?: Prisma.InputJsonValue
}

export interface AuditRepository {
  append(input: AuditLogInput): Promise<void>
}
