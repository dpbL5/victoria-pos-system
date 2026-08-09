// ── Ports — repository interface cho domain tools ─────
import type { Prisma } from '@/generated/prisma/client'

export type ToolRecord = Prisma.ToolGetPayload<object>

export interface ToolRepository {
  /** Danh sách dụng cụ (orderBy order) — GET /api/tools */
  findMany(): Promise<ToolRecord[]>
  /** Dụng cụ theo id — cho PATCH/DELETE */
  findById(id: string): Promise<ToolRecord | null>
  /** Tạo dụng cụ */
  create(data: { name: string; description?: string; quantity: number; isRequired: boolean; order: number }): Promise<ToolRecord>
  /** Cập nhật dụng cụ */
  update(id: string, data: { name?: string; description?: string; quantity?: number; isRequired?: boolean; order?: number }): Promise<ToolRecord>
  /** Xoá dụng cụ */
  delete(id: string): Promise<void>
}
