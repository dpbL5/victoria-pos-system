// ── Adapter: implement UserRepository bằng Prisma ─────
import type { Prisma } from '@/generated/prisma/client'
import type { UserRepository } from '@/lib/users'

type UserStore = Pick<Prisma.TransactionClient, 'user' | 'shiftParticipant'>

export function createUserRepository(store: UserStore): UserRepository {
  return {
    findByUsername: (username) => store.user.findUnique({ where: { username } }),
    findById: (id) => store.user.findUnique({ where: { id } }),
    async findMany() {
      return store.user.findMany({
        select: {
          id: true,
          username: true,
          fullName: true,
          role: true,
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
          role: data.role,
        },
        select: {
          id: true,
          username: true,
          fullName: true,
          role: true,
          isActive: true,
          createdAt: true,
        },
      })
    },
    async update(id, data) {
      return store.user.update({
        where: { id },
        data,
        select: { id: true, username: true, fullName: true, role: true, isActive: true, createdAt: true },
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
