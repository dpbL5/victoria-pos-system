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

    async findManyForAdmin(input) {
      return store.product.findMany({
        where: {
          ...(input.search
            ? {
                OR: [
                  { name: { contains: input.search, mode: 'insensitive' } },
                  { sku: { contains: input.search, mode: 'insensitive' } },
                ],
              }
            : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
        select: {
          id: true,
          name: true,
          sku: true,
          type: true,
          price: true,
          stockQuantity: true,
          minStockLevel: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
          // costPrice intentionally excluded — sensitive business data
        },
        orderBy: { name: 'asc' },
        take: input.take ?? 100,
      })
    },

    async findByIdAdmin(id) {
      return store.product.findUnique({ where: { id } })
    },

    async createWithInitialStock(input) {
      const created = await store.product.create({
        data: {
          name: input.name,
          sku: input.sku,
          type: input.type,
          price: input.price,
          costPrice: input.costPrice,
          stockQuantity: input.type === 'SERVICE' ? 0 : input.stockQuantity,
          minStockLevel: input.type === 'SERVICE' ? 0 : input.minStockLevel,
          isActive: input.isActive,
        },
      })

      if (created.type === 'PRODUCT' && created.stockQuantity > 0) {
        await store.stockMovement.create({
          data: {
            productId: created.id,
            staffId: input.staffId,
            type: 'RESTOCK',
            quantity: created.stockQuantity,
            unitCost: input.costPrice,
            reason: 'Tồn đầu kỳ',
          },
        })
      }

      return created
    },

    async applyStockMovement(input) {
      const product = await store.product.findUnique({ where: { id: input.productId } })
      if (!product) throw new Error('PRODUCT_NOT_FOUND')
      if (product.type === 'SERVICE') throw new Error('SERVICE_HAS_NO_STOCK')

      const nextStock = product.stockQuantity + input.quantity
      if (nextStock < 0) throw new Error('NEGATIVE_STOCK')

      const movement = await store.stockMovement.create({
        data: {
          productId: product.id,
          shiftId: input.shiftId,
          staffId: input.staffId,
          type: input.type,
          quantity: input.quantity,
          unitCost: input.unitCost,
          reason: input.reason,
        },
      })

      // ── Cập nhật giá vốn theo weighted average khi nhập kho (RESTOCK) ──
      // costPrice_mới = (stock_cũ × costPrice_cũ + q_nhập × unitCost_nhập) / (stock_cũ + q_nhập)
      // Chỉ áp dụng khi có unitCost nhập vào; tồn đầu kỳ (createWithInitialStock) đã set costPrice lúc tạo.
      let costPriceUpdate: { costPrice?: number } = {}
      if (
        input.type === 'RESTOCK' &&
        input.unitCost != null &&
        input.unitCost > 0 &&
        product.stockQuantity > 0
      ) {
        const currentValue = Number(product.costPrice ?? 0) * product.stockQuantity
        const addedValue = input.unitCost * input.quantity
        const weightedAvg = (currentValue + addedValue) / nextStock
        costPriceUpdate = { costPrice: Math.round(weightedAvg) }
      } else if (input.type === 'RESTOCK' && input.unitCost != null && input.unitCost > 0) {
        // Lô nhập đầu tiên — giá vốn = giá nhập lô này
        costPriceUpdate = { costPrice: input.unitCost }
      }

      const updatedProduct = await store.product.update({
        where: { id: product.id },
        data: { stockQuantity: nextStock, ...costPriceUpdate },
      })

      return {
        movementId: movement.id,
        before: product.stockQuantity,
        after: updatedProduct.stockQuantity,
        shiftId: input.shiftId,
        type: movement.type,
        quantity: movement.quantity,
      }
    },
  }
}
