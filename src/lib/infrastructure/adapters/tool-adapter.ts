// ── Adapter: implement ToolRepository bằng Prisma ─────
import type { Prisma } from '@/generated/prisma/client'
import type { ToolRepository } from '@/lib/tools'

type ToolStore = Pick<Prisma.TransactionClient, 'tool'>

export function createToolRepository(store: ToolStore): ToolRepository {
  return {
    findMany: () => store.tool.findMany({ orderBy: { order: 'asc' } }),
    findById: (id) => store.tool.findUnique({ where: { id } }),
    create: (data) => store.tool.create({ data }),
    update: (id, data) => store.tool.update({ where: { id }, data }),
    delete: async (id) => {
      await store.tool.delete({ where: { id } })
    },
  }
}
