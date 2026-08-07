// ── Adapter: implement ProductRepository bằng Prisma ─────
import type { ProductStore } from '../store-types'
import type { ProductRecord, ProductRepository } from '@/lib/sessions/ports'

const PRODUCT_SELECT = {
  id: true,
  name: true,
  type: true,
  price: true,
  costPrice: true,
  stockQuantity: true,
  isActive: true,
} as const

function toProductRecord(p: {
  id: string
  name: string
  type: 'PRODUCT' | 'SERVICE'
  price: unknown
  costPrice: unknown
  stockQuantity: number
  isActive: boolean
}): ProductRecord {
  return {
    id: p.id,
    name: p.name,
    type: p.type,
    price: Number(p.price),
    costPrice: p.costPrice !== null ? Number(p.costPrice) : null,
    stockQuantity: Number(p.stockQuantity),
    isActive: p.isActive,
  }
}

export function createProductRepository(store: ProductStore): ProductRepository {
  return {
    async findManyByIds(ids) {
      const products = await store.product.findMany({
        where: { id: { in: ids }, isActive: true },
        select: PRODUCT_SELECT,
      })
      return products.map(toProductRecord)
    },

    async findByIdForSale(id) {
      const product = await store.product.findUnique({
        where: { id },
        select: PRODUCT_SELECT,
      })
      return product ? toProductRecord(product) : null
    },

    async decrementStockIfAvailable(id, quantity) {
      return store.product.updateMany({
        where: { id, stockQuantity: { gte: quantity } },
        data: { stockQuantity: { decrement: quantity } },
      })
    },

    async recordSaleMovement(input) {
      await store.stockMovement.create({
        data: {
          productId: input.productId,
          invoiceItemId: input.invoiceItemId,
          shiftId: input.shiftId,
          staffId: input.staffId,
          type: 'SALE',
          quantity: -input.quantity,
          unitCost: input.unitCost,
          reason: input.reason,
        },
      })
    },
  }
}
