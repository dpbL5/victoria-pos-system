// ── Adapter: implement UserRepository bằng Prisma ─────
import type { Prisma } from '@/generated/prisma/client'
import type { UserRepository } from '@/lib/users'

type UserStore = Pick<Prisma.TransactionClient, 'user' | 'shiftParticipant'>

export function createUserRepository(store: UserStore): UserRepository {
  return {
    findByUsername: (username) =>
      store.user.findUnique({
        where: { username },
        include: { role: { select: { id: true, key: true, name: true, locked: true } } },
      }),
    findById: (id) =>
      store.user.findUnique({
        where: { id },
        include: { role: { select: { id: true, key: true, name: true, locked: true } } },
      }),
    async findMany() {
      return store.user.findMany({
        select: {
          id: true,
          username: true,
          fullName: true,
          roleId: true,
          role: { select: { id: true, key: true, name: true, locked: true } },
          isActive: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      })
    },
    async create(data) {
      return store.user.create({
        data: {
          username: data.username,
          passwordHash: data.passwordHash,
          fullName: data.fullName,
          roleId: data.roleId,
        },
        select: {
          id: true,
          username: true,
          fullName: true,
          roleId: true,
          role: { select: { id: true, key: true, name: true, locked: true } },
          isActive: true,
          createdAt: true,
        },
      })
    },
    async update(id, data) {
      return store.user.update({
        where: { id },
        data,
        select: {
          id: true,
          username: true,
          fullName: true,
          roleId: true,
          role: { select: { id: true, key: true, name: true, locked: true } },
          isActive: true,
          createdAt: true,
        },
      })
    },
    async findActiveOpenShiftParticipants(staffId) {
      return store.shiftParticipant.findMany({
        where: {
          staffId,
          leftAt: null,
          shift: { status: 'OPEN' },
        },
        select: { shiftId: true },
      })
    },
  }
}
