// ── Validations — Zod schema cho cashflow ─────
import { z } from 'zod'

export const createCashflowSchema = z.object({
  type: z.enum(['INCOME', 'EXPENSE'], {
    message: 'Loại phải là thu hoặc chi',
  }),
  personName: z
    .string()
    .trim()
    .min(1, 'Nhập người phát sinh')
    .max(100, 'Tên tối đa 100 ký tự'),
  amount: z.number({ message: 'Nhập số tiền' }).positive('Số tiền phải lớn hơn 0'),
  reason: z
    .string()
    .trim()
    .min(1, 'Nhập lý do')
    .max(500, 'Lý do tối đa 500 ký tự'),
})

export type CreateCashflowInput = z.infer<typeof createCashflowSchema>

// updateCashflowSchema = createCashflowSchema (same fields, no staffId)
export const updateCashflowSchema = createCashflowSchema
export type UpdateCashflowInput = z.infer<typeof updateCashflowSchema>
