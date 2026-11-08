// ── Role validation schemas ─────────────────────────────
import { z } from 'zod'

export const createRoleSchema = z.object({
  name: z.string().min(1, 'Tên vai trò không được để trống').max(100, 'Tên vai trò tối đa 100 ký tự'),
  description: z.string().max(500, 'Mô tả tối đa 500 ký tự').nullish(),
  permissions: z.array(z.string()).default([]),
})

export const updateRoleSchema = z.object({
  name: z.string().min(1, 'Tên vai trò không được để trống').max(100, 'Tên vai trò tối đa 100 ký tự').optional(),
  description: z.string().max(500, 'Mô tả tối đa 500 ký tự').nullish(),
  permissions: z.array(z.string()).optional(),
})

export type CreateRoleInput = z.infer<typeof createRoleSchema>
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>
