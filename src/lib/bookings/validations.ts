import { z } from 'zod'

const customerFields = {
  customerId: z.string().uuid('ID khách hàng không hợp lệ').nullable().optional(),
  customerName: z.string().trim().max(100, 'Tên khách tối đa 100 ký tự').nullable().optional(),
  customerPhone: z.string().trim().regex(/^\d{9,11}$/, 'SĐT không hợp lệ (9-11 chữ số)').nullable().optional(),
}

export const createBookingSchema = z.object({
  ...customerFields,
  scheduledAt: z.string().datetime('Giờ hẹn không hợp lệ'),
  playerCount: z.number().int().min(1, 'Số người chơi tối thiểu là 1').max(50, 'Số người chơi tối đa là 50').default(1),
  depositAmount: z.number().int().min(0, 'Tiền cọc không được âm').max(999_999_999_999, 'Tiền cọc quá lớn').default(0),
  depositPaymentMethod: z.enum(['CASH', 'TRANSFER', 'CARD'], { message: 'Phương thức thanh toán không hợp lệ' }).optional(),
  notes: z.string().trim().max(500, 'Ghi chú tối đa 500 ký tự').nullable().optional(),
}).superRefine((data, ctx) => {
  if (!data.customerId && !data.customerName?.trim()) {
    ctx.addIssue({ code: 'custom', path: ['customerName'], message: 'Nhập tên khách hoặc chọn khách đã có' })
  }
  if (data.depositAmount > 0 && !data.depositPaymentMethod) {
    ctx.addIssue({ code: 'custom', path: ['depositPaymentMethod'], message: 'Chọn phương thức nhận tiền cọc' })
  }
})

export const updateBookingSchema = z.object({
  ...customerFields,
  scheduledAt: z.string().datetime('Giờ hẹn không hợp lệ').optional(),
  playerCount: z.number().int().min(1).max(50).optional(),
  notes: z.string().trim().max(500).nullable().optional(),
}).refine((data) => Object.values(data).some((value) => value !== undefined), {
  message: 'Chọn thông tin cần cập nhật',
}).superRefine((data, ctx) => {
  if (data.customerId === null && !data.customerName?.trim()) {
    ctx.addIssue({ code: 'custom', path: ['customerName'], message: 'Nhập tên khách hoặc chọn khách đã có' })
  }
})

export const bookingStatusSchema = z.object({
  status: z.literal('CANCELLED'),
})

export type CreateBookingInput = z.infer<typeof createBookingSchema>
export type UpdateBookingInput = z.infer<typeof updateBookingSchema>
