import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/shared/auth'
import { isManagerOrAdmin } from '@/lib/shared/roles'
import { repositories } from '@/lib/infrastructure/repositories'
import type { StockMovementType } from '@/types'
import {
  apiSuccess,
  apiError,
  ERR_UNAUTHORIZED,
  ERR_FORBIDDEN,
} from '@/lib/infrastructure/api-helpers'

const MOVEMENT_TYPES: StockMovementType[] = ['RESTOCK', 'SALE', 'ADJUSTMENT', 'VOID']

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (!isManagerOrAdmin(auth.role)) {
      return apiError(ERR_FORBIDDEN)
    }

    const { searchParams } = new URL(request.url)
    const typeParam = searchParams.get('type')
    const type = MOVEMENT_TYPES.find((value) => value === typeParam)
    const productId = searchParams.get('productId') || undefined

    const rows = await repositories.product.findStockMovements({
      ...(type ? { type } : {}),
      ...(productId ? { productId } : {}),
    })

    return apiSuccess(rows)
  } catch (error) {
    if ((error as Error).message === 'UNAUTHORIZED') return apiError(ERR_UNAUTHORIZED)
    console.error('GET /api/stock-movements error:', error)
    return apiError({ code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 })
  }
}
