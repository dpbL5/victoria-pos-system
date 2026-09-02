import { z } from 'zod'

const toolCountEntry = z.object({
  toolId: z.string().uuid('Dụng cụ không hợp lệ'),
  openCount: z.number().int().nonnegative('Số lượng mở ca không được âm').default(0),
})

export const openShiftSchema = z.object({
  openingCash: z.number().nonnegative('Tiền đầu ca không được âm').default(0),
  notes: z.string().max(500).optional(),
  toolCounts: z.array(toolCountEntry).optional(),
})

export const closeShiftSchema = z.object({
  closingCash: z.number().nonnegative('Tiền cuối ca không được âm'),
  notes: z.string().max(500).optional(),
  toolCounts: z.array(toolCountEntry).optional(),
})

export const logToolCountSchema = z.object({
  toolCounts: z.array(toolCountEntry).min(1, 'Chưa có số liệu dụng cụ'),
})

export const adjustCashDifferenceSchema = z.object({
  cashDifference: z.number(),
  notes: z.string().max(500).optional(),
})

export type ToolCountEntry = z.infer<typeof toolCountEntry>
export type OpenShiftInput = z.infer<typeof openShiftSchema>
export type CloseShiftInput = z.infer<typeof closeShiftSchema>
export type LogToolCountInput = z.infer<typeof logToolCountSchema>
export type AdjustCashDifferenceInput = z.infer<typeof adjustCashDifferenceSchema>
