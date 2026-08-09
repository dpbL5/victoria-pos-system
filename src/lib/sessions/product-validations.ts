import { z } from 'zod'

export const createProductSchema = z.object({
  name: z.string().min(1, 'Tên hàng hóa không được để trống').max(120),
  sku: z.string().max(50).optional().or(z.literal('')),
  type: z.enum(['PRODUCT', 'SERVICE']).default('PRODUCT'),
  price: z.number().positive('Giá bán phải lớn hơn 0'),
  costPrice: z.number().nonnegative('Giá vốn không được âm').optional(),
  stockQuantity: z.number().int().min(0, 'Tồn kho không được âm').default(0),
  minStockLevel: z.number().int().min(0, 'Tồn tối thiểu không được âm').default(0),
  isActive: z.boolean().default(true),
})

export const stockMovementSchema = z.object({
  type: z.enum(['RESTOCK', 'ADJUSTMENT', 'SALE', 'VOID']),
  quantity: z.number().int().refine((value) => value !== 0, 'Số lượng không được bằng 0'),
  unitCost: z.number().nonnegative('Giá vốn không được âm').optional(),
  reason: z.string().max(500).optional(),
})

export type CreateProductInput = z.infer<typeof createProductSchema>
export type StockMovementInput = z.infer<typeof stockMovementSchema>
