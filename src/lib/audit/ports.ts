// ── Ports — repository interface cho domain audit ─────
import type { Prisma } from '@/generated/prisma/client'

export interface AuditLogInput {
  userId: string
  action: string
  entityType: string
  entityId: string
  details?: Prisma.InputJsonValue
}

export interface AuditListFilter {
  userId?: string
  action?: string
  entityType?: string
  search?: string
  take: number
}

export interface AuditRepository {
  append(input: AuditLogInput): Promise<void>
  /** Danh sách log (filter + limit) — GET /api/activity-logs */
  findMany(input: AuditListFilter): Promise<{
    rows: Array<{
      id: string
      userId: string
      action: string
      entityType: string
      entityId: string
      details: Prisma.JsonValue | null
      createdAt: Date
      user: { id: string; username: string; fullName: string; role: string } | null
    }>
    total: number
  }>
}
