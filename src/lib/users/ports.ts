// ── Ports — repository interface cho domain users ─────
import type { Prisma } from '@/generated/prisma/client'

export type UserRecord = Prisma.UserGetPayload<object>
export type UserWithRole = UserRecord & {
  role: { id: string; key: string | null; name: string; locked: boolean } | null
}
export type UserListItem = Prisma.UserGetPayload<{
  select: {
    id: true
    username: true
    fullName: true
    roleId: true
    role: { select: { id: true; key: true; name: true; locked: true } }
    isActive: true
    createdAt: true
  }
}>

export interface UserRepository {
  /** User theo username — cho login */
  findByUsername(username: string): Promise<UserWithRole | null>
  /** User theo id — cho PUT/PATCH */
  findById(id: string): Promise<UserWithRole | null>
  /** Danh sách user — GET /api/users */
  findMany(): Promise<UserListItem[]>
  /** Tạo user (đã hash password) — roleId null = "Chưa phân vai" */
  create(data: {
    username: string
    passwordHash: string
    fullName: string
    roleId: string | null
  }): Promise<UserListItem>
  /** Cập nhật user */
  update(id: string, data: { fullName?: string; roleId?: string | null; isActive?: boolean; passwordHash?: string }): Promise<UserListItem>
  /** Participants chưa rời ca của staff — chặn khoá user đang trong ca OPEN */
  findActiveOpenShiftParticipants(staffId: string): Promise<Array<{ shiftId: string }>>
}
