// ── Ports — repository interface cho domain roles ─────
import type { Prisma } from '@/generated/prisma/client'

export type RoleListItem = Prisma.RoleGetPayload<{
  select: {
    id: true
    key: true
    name: true
    description: true
    locked: true
    permissions: { select: { permission: true } }
    _count: { select: { users: true } }
  }
}>

export interface RoleRepository {
  findMany(): Promise<RoleListItem[]>
  findById(id: string): Promise<RoleListItem | null>
  findByKey(key: string): Promise<RoleListItem | null>
  /** Tạo role kèm danh sách permission (đã validate khóa ở use-case) */
  create(data: { name: string; description: string | null; permissions: string[] }): Promise<RoleListItem>
  /** Cập nhật thông tin; truyền permissions → thay toàn bộ danh sách quyền */
  update(id: string, data: { name?: string; description?: string | null; permissions?: string[] }): Promise<RoleListItem>
  countUsers(id: string): Promise<number>
  /** Gỡ gán role khỏi mọi user (roleId → null — "Chưa phân vai") */
  detachUsers(id: string): Promise<void>
  remove(id: string): Promise<void>
}
