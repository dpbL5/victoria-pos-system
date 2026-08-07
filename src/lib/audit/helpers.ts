import { Prisma } from '@/generated/prisma/client'
import type { AuditLogInput } from './ports'

type AuditStore = Pick<Prisma.TransactionClient, 'activityLog'>

export async function logActivity(
  db: AuditStore,
  input: AuditLogInput
) {
  return db.activityLog.create({
    data: {
      userId: input.userId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      details: input.details,
    },
  })
}
