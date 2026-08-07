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

const pricingTierSchema = z.object({
  minHours: z.number().int().min(1, 'Số giờ tối thiểu phải từ 1'),
  ratePerHour: z.number().positive('Giá theo giờ phải lớn hơn 0'),
})

const basePricingRuleSchema = z.object({
  name: z.string().min(1, 'Tên quy tắc không được để trống').max(100),
  daysOfWeek: daysOfWeekSchema,
  hourFrom: z.number().int().min(0, 'Giờ bắt đầu phải từ 0-23').max(23, 'Giờ bắt đầu phải từ 0-23'),
  hourTo: z.number().int().min(1, 'Giờ kết thúc phải từ 1-24').max(24, 'Giờ kết thúc phải từ 1-24').nullable().optional(),
  ratePerHour: z.number().positive('Giá theo giờ phải lớn hơn 0'),
  dayType: z.enum(['WEEKDAY', 'WEEKEND']).optional(),
  effectiveFrom: z.string().min(1, 'Ngày hiệu lực không được để trống'),
  effectiveTo: z.string().nullable().optional(),
  tiers: z.array(pricingTierSchema).optional(),
})

export const createPricingRuleSchema = basePricingRuleSchema.superRefine((value, ctx) => {
  validatePricingRange(value, ctx)
})

export const updatePricingRuleSchema = basePricingRuleSchema.partial().superRefine((value, ctx) => {
  validatePricingRange(value, ctx)
})

function validatePricingRange(
  value: {
    hourFrom?: number
    hourTo?: number | null
    effectiveFrom?: string
    effectiveTo?: string | null
  },
  ctx: z.RefinementCtx
) {
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

export type CreatePricingRuleInput = z.infer<typeof createPricingRuleSchema>
export type UpdatePricingRuleInput = z.infer<typeof updatePricingRuleSchema>
