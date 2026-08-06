// ── Invoice validation schemas ─────────────────────────
import { z } from 'zod'

const editInvoiceItemSchema = z.object({
  productId: z.string().uuid('Sản phẩm không hợp lệ'),
  quantity: z
    .number()
    .int('Số lượng phải là số nguyên')
    .min(1, 'Số lượng tối thiểu là 1')
    .max(999, 'Số lượng tối đa là 999'),
})

export const editInvoiceSchema = z.object({
  items: z
    .array(editInvoiceItemSchema)
    .max(100, 'Quá nhiều mục hàng')
    .default([]),
  paymentMethod: z.enum(['CASH', 'TRANSFER', 'CARD', 'MEMBER'], {
    message: 'Phương thức thanh toán không hợp lệ',
  }),
  notes: z.string().max(500, 'Ghi chú tối đa 500 ký tự').nullable().optional(),
})

export type EditInvoiceItem = z.infer<typeof editInvoiceItemSchema>
export type EditInvoiceInput = z.infer<typeof editInvoiceSchema>
