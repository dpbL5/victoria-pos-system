import { NextRequest } from 'next/server'
import { requireMutationAuth } from '@/lib/shared/auth'
import { retailSale, mapRetailSaleError } from '@/lib/invoicing'
import {
  apiError,
  resultToResponse,
  ERR_UNAUTHORIZED,
  ERR_CSRF,
} from '@/lib/infrastructure/api-helpers'
import { z } from 'zod'

const retailSaleSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().uuid('ID sản phẩm không hợp lệ'),
        quantity: z.number().int().positive('Số lượng phải lớn hơn 0'),
      })
    )
    .min(1, 'Cần chọn ít nhất một sản phẩm'),
  paymentMethod: z.enum(['CASH', 'TRANSFER', 'CARD'], {
    message: 'Phương thức thanh toán không hợp lệ',
  }),
  customerId: z.string().uuid('ID khách hàng không hợp lệ').nullable().optional(),
  notes: z.string().max(500).optional(),
})

/** Bán lẻ (nước/dịch vụ) không gắn phiên — tạo invoice PAID + thu tiền ngay */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireMutationAuth(request)

    const body = await request.json()
    const parsed = retailSaleSchema.safeParse(body)

    if (!parsed.success) {
      return apiError({ code: 'VALIDATION', message: parsed.error.issues[0].message, status: 400 })
    }

    const result = await retailSale({
      staffId: auth.userId,
      customerId: parsed.data.customerId ?? null,
      items: parsed.data.items,
      paymentMethod: parsed.data.paymentMethod,
      notes: parsed.data.notes,
    })

    return resultToResponse(result, mapRetailSaleError)
  } catch (error) {
    const message = (error as Error).message
    if (message === 'UNAUTHORIZED') return apiError(ERR_UNAUTHORIZED)
    if (message === 'CSRF_MISMATCH') return apiError(ERR_CSRF)
    console.error('POST /api/retail-sales error:', error)
    return apiError({ code: 'SERVER_ERROR', message: 'Lỗi máy chủ', status: 500 })
  }
}
