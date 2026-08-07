import { z } from 'zod'

const daysOfWeekSchema = z
  .array(z.number().int().min(0, 'Ngày lặp phải từ CN đến T7').max(6, 'Ngày lặp phải từ CN đến T7'))
  .min(1, 'Chọn ít nhất một ngày lặp trong tuần')
  .max(7, 'Một tuần chỉ có 7 ngày')
  .superRefine((days, ctx) => {
    if (new Set(days).size !== days.length) {
      ctx.addIssue({
        code: 'custom',
        message: 'Ngày lặp không được trùng nhau',
      })
    }
  })

const basePromotionRuleSchema = z.object({
  name: z.string().trim().min(1, 'Tên khuyến mại không được để trống').max(100),
  discountType: z.enum(['FIXED_AMOUNT', 'PERCENT', 'FIXED_PER_HOUR', 'PERCENT_PLAY_TIME']),
  discountValue: z.number().positive('Giá trị giảm phải lớn hơn 0'),
  daysOfWeek: daysOfWeekSchema,
  hourFrom: z.number().int().min(0, 'Giờ bắt đầu phải từ 0-23').max(23, 'Giờ bắt đầu phải từ 0-23'),
  hourTo: z.number().int().min(1, 'Giờ kết thúc phải từ 1-24').max(24, 'Giờ kết thúc phải từ 1-24').nullable().optional(),
  effectiveFrom: z.string().min(1, 'Ngày hiệu lực không được để trống'),
  effectiveTo: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
})

export const createPromotionRuleSchema = basePromotionRuleSchema.superRefine((value, ctx) => {
  validatePromotionRule(value, ctx)
})

export const updatePromotionRuleSchema = basePromotionRuleSchema.partial().superRefine((value, ctx) => {
  validatePromotionRule(value, ctx)
})

function validatePromotionRule(
  value: {
    discountType?: 'FIXED_AMOUNT' | 'PERCENT' | 'FIXED_PER_HOUR' | 'PERCENT_PLAY_TIME'
    discountValue?: number
    hourFrom?: number
    hourTo?: number | null
    effectiveFrom?: string
    effectiveTo?: string | null
  },
  ctx: z.RefinementCtx
) {
  if (
    (value.discountType === 'PERCENT' || value.discountType === 'PERCENT_PLAY_TIME')
    && value.discountValue !== undefined
    && value.discountValue > 100
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['discountValue'],
      message: 'Phần trăm giảm không được vượt quá 100%',
    })
  }

  if (
    value.hourFrom !== undefined
    && value.hourTo !== undefined
    && value.hourTo !== null
    && value.hourTo <= value.hourFrom
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['hourTo'],
      message: 'Giờ kết thúc phải sau giờ bắt đầu',
    })
  }

  if (value.effectiveFrom && value.effectiveTo) {
    const from = new Date(value.effectiveFrom)
    const to = new Date(value.effectiveTo)
    if (Number.isFinite(from.getTime()) && Number.isFinite(to.getTime()) && to < from) {
      ctx.addIssue({
        code: 'custom',
        path: ['effectiveTo'],
        message: 'Ngày hết hiệu lực phải sau ngày bắt đầu',
      })
    }
  }
}

export type CreatePromotionRuleInput = z.infer<typeof createPromotionRuleSchema>
export type UpdatePromotionRuleInput = z.infer<typeof updatePromotionRuleSchema>
