import { z } from 'zod'

export const createMembershipPlanSchema = z.object({
  name: z.string().min(1, 'Tên gói không được để trống').max(100),
  durationMonths: z.number().int().positive('Số tháng phải lớn hơn 0').default(1),
  price: z.number().positive('Giá gói phải lớn hơn 0'),
  isActive: z.boolean().default(true),
})

export const updateMembershipPlanSchema = z.object({
  name: z.string().min(1, 'Tên gói không được để trống').max(100).optional(),
  durationMonths: z.number().int().positive('Số tháng phải lớn hơn 0').optional(),
  price: z.number().positive('Giá gói phải lớn hơn 0').optional(),
  isActive: z.boolean().optional(),
})

export const renewMembershipSchema = z.object({
  customerId: z.string().uuid('ID khách hàng không hợp lệ'),
  planId: z.string().uuid('ID gói hội viên không hợp lệ'),
  paymentMethod: z.enum(['CASH', 'TRANSFER', 'CARD']),
  paidAt: z.string().datetime().optional(),
  notes: z.string().max(500).optional(),
})

export const registerMemberSchema = z.object({
  fullName: z.string().min(1, 'Họ tên không được để trống').max(100),
  phone: z
    .string()
    .regex(/^0\d{9,10}$/, 'Số điện thoại không hợp lệ')
    .optional()
    .or(z.literal('')),
  planId: z.string().uuid('ID gói hội viên không hợp lệ'),
  paymentMethod: z.enum(['CASH', 'TRANSFER', 'CARD']),
  paidAt: z.string().datetime().optional(),
  notes: z.string().max(500).optional(),
})

export type CreateMembershipPlanInput = z.infer<typeof createMembershipPlanSchema>
export type UpdateMembershipPlanInput = z.infer<typeof updateMembershipPlanSchema>
export type RenewMembershipInput = z.infer<typeof renewMembershipSchema>
export type RegisterMemberInput = z.infer<typeof registerMemberSchema>
