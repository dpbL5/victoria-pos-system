// ── Ports — repository interface cho domain users ─────
import type { Prisma } from '@/generated/prisma/client'

export type UserRecord = Prisma.UserGetPayload<object>
export type UserListItem = Prisma.UserGetPayload<{
  select: {
    id: true
    username: true
    fullName: true
    role: true
    isActive: true
    createdAt: true
  }
}>

export interface UserRepository {
  /** User theo username — cho login */
  findByUsername(username: string): Promise<UserRecord | null>
  /** User theo id — cho PUT/PATCH */
  findById(id: string): Promise<UserRecord | null>
  /** Danh sách user — GET /api/users */
  findMany(): Promise<UserListItem[]>
  /** Tạo user (đã hash password) */
  create(data: {
    username: string
    passwordHash: string
    fullName: string
    role: 'ADMIN' | 'STAFF'
  }): Promise<UserListItem>
  /** Cập nhật user */
  update(id: string, data: { fullName?: string; role?: 'ADMIN' | 'STAFF'; isActive?: boolean; passwordHash?: string }): Promise<UserListItem>
  /** Participants chưa rời ca của staff — chặn khoá user đang trong ca OPEN */
  findActiveOpenShiftParticipants(staffId: string): Promise<Array<{ shiftId: string }>>
}
