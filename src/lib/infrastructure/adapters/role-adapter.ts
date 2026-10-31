// ── Adapter: implement RoleRepository bằng Prisma ─────
import type { Prisma } from '@/generated/prisma/client'
import type { RoleRepository, RoleListItem } from '@/lib/roles'

type RoleStore = Pick<Prisma.TransactionClient, 'role' | 'rolePermission' | 'user'>

const ROLE_SELECT = {
  id: true,
  key: true,
  name: true,
  description: true,
  locked: true,
  permissions: { select: { permission: true } },
  _count: { select: { users: true } },
} as const

export function createRoleRepository(store: RoleStore): RoleRepository {
  return {
    findMany() {
      return store.role.findMany({
        select: ROLE_SELECT,
        orderBy: [{ locked: 'desc' }, { name: 'asc' }],
      })
    },
    findById(id) {
      return store.role.findUnique({ where: { id }, select: ROLE_SELECT })
    },
    findByKey(key) {
      return store.role.findUnique({ where: { key }, select: ROLE_SELECT })
    },
    async create(data) {
      return store.role.create({
        data: {
          name: data.name,
          description: data.description,
          permissions: { create: data.permissions.map((permission) => ({ permission })) },
        },
        select: ROLE_SELECT,
      })
    },
    async update(id, data) {
      if (data.permissions !== undefined) {
        await store.rolePermission.deleteMany({ where: { roleId: id } })
        if (data.permissions.length > 0) {
          await store.rolePermission.createMany({
            data: data.permissions.map((permission) => ({ roleId: id, permission })),
          })
        }
      }
      return store.role.update({
        where: { id },
        data: {
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.description !== undefined ? { description: data.description } : {}),
        },
        select: ROLE_SELECT,
      })
    },
    async countUsers(id) {
      return store.user.count({ where: { roleId: id } })
    },
    async detachUsers(id) {
      await store.user.updateMany({ where: { roleId: id }, data: { roleId: null } })
    },
    async remove(id) {
      await store.role.delete({ where: { id } })
    },
  }
}
