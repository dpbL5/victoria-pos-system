import { NextRequest } from 'next/server'
import { requireAuth, requireMutationAuth } from '@/lib/shared/auth'
import { isManagerOrAdmin } from '@/lib/shared/roles'
import { validateCSRF } from '@/lib/shared/csrf'
import { createProduct, mapCreateProductError } from '@/lib/sessions'
import { repositories } from '@/lib/infrastructure/repositories'
import { createProductSchema } from '@/lib/sessions'
import {
  apiSuccess,
  apiError,
  resultToResponse,
  ERR_UNAUTHORIZED,
  ERR_FORBIDDEN,
  ERR_CSRF,
} from '@/lib/infrastructure/api-helpers'

export async function GET(request: NextRequest) {
  try {
    await requireAuth()

    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || ''
    const isActiveParam = searchParams.get('isActive')

    const products = await repositories.product.findManyForAdmin({
      ...(search ? { search } : {}),
      ...(isActiveParam ? { isActive: isActiveParam === 'true' } : {}),
      take: 100,
    })

    return apiSuccess(products)
  } catch (error) {
    if ((error as Error).message === 'UNAUTHORIZED') return apiError(ERR_UNAUTHORIZED)
    console.error('GET /api/products error:', error)
    return apiError({ code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireMutationAuth(request)
    if (!isManagerOrAdmin(auth.role)) {
      return apiError({ code: 'FORBIDDEN', message: 'Không có quyền', status: 403 })
    }
    await validateCSRF(request)
    const body = await request.json()
    const parsed = createProductSchema.safeParse(body)

    if (!parsed.success) {
      return apiError({ code: 'VALIDATION', message: parsed.error.issues[0].message, status: 400 })
    }

    const result = await createProduct({
      staffId: auth.userId,
      name: parsed.data.name,
      sku: parsed.data.sku ?? null,
      type: parsed.data.type,
      price: parsed.data.price,
      stockQuantity: parsed.data.stockQuantity,
      minStockLevel: parsed.data.minStockLevel,
      isActive: parsed.data.isActive,
    })
    return resultToResponse(result, mapCreateProductError, 201)
  } catch (error) {
    const message = (error as Error).message
    if (message === 'UNAUTHORIZED') return apiError(ERR_UNAUTHORIZED)
    if (message === 'CSRF_MISMATCH') return apiError(ERR_CSRF)
    if (message === 'FORBIDDEN') return apiError(ERR_FORBIDDEN)
    console.error('POST /api/products error:', error)
    return apiError({ code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 })
  }
}
