import { z } from 'zod'

export const createToolSchema = z.object({
  name: z.string().min(1, 'Tên dụng cụ không được để trống').max(120),
  description: z.string().max(1000).optional(),
  quantity: z.number().int().nonnegative('Số lượng chuẩn không được âm').default(0),
  isRequired: z.boolean().default(false),
  order: z.number().int().nonnegative().default(0),
})

export const updateToolSchema = createToolSchema.partial()

export type CreateToolInput = z.infer<typeof createToolSchema>
export type UpdateToolInput = z.infer<typeof updateToolSchema>
