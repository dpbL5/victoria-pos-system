// ── Adapter: implement ProductRepository bằng Prisma ─────
import type { ProductStore } from '../store-types'
import type { ProductRecord, ProductRepository } from '@/lib/sessions/ports'
import type { StockMovementRow, StockMovementType } from '@/types'

const PRODUCT_SELECT = {
  id: true,
  name: true,
  type: true,
  price: true,
  stockQuantity: true,
  isActive: true,
} as const

function toProductRecord(p: {
  id: string
  name: string
  type: 'PRODUCT' | 'SERVICE'
  price: unknown
  stockQuantity: number
  isActive: boolean
}): ProductRecord {
  return {
    id: p.id,
    name: p.name,
    type: p.type,
    price: Number(p.price),
    stockQuantity: Number(p.stockQuantity),
    isActive: p.isActive,
  }
}

type StockMovementRaw = {
  id: string
  type: StockMovementType
  quantity: number
  reason: string | null
  createdAt: Date
  product: { id: string; name: string; sku: string | null }
  staff: { fullName: string } | null
  invoiceItem: { invoice: { invoiceNo: string; sessionId: string | null } | null } | null
}

/**
 * Hoá đơn không gắn phiên = bán lẻ tại quầy; còn lại (bán kèm ghi tạm trong phiên,
 * hoặc gắn vào hoá đơn của phiên) = bán kèm.
 */
function toStockMovementRow(m: StockMovementRaw): StockMovementRow {
  const invoice = m.invoiceItem?.invoice ?? null
  return {
    id: m.id,
    type: m.type,
    quantity: m.quantity,
    reason: m.reason,
    createdAt: m.createdAt.toISOString(),
    productId: m.product.id,
    productName: m.product.name,
    productSku: m.product.sku,
    staffName: m.staff?.fullName ?? null,
    invoiceNo: invoice?.invoiceNo ?? null,
    channel: m.type === 'SALE' ? (invoice && !invoice.sessionId ? 'RETAIL' : 'SESSION') : null,
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
          reason: input.reason,
        },
      })

      const updatedProduct = await store.product.update({
        where: { id: product.id },
        data: { stockQuantity: nextStock },
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

    async findStockMovements(input) {
      const rows = await store.stockMovement.findMany({
        where: {
          ...(input.type ? { type: input.type } : {}),
          ...(input.productId ? { productId: input.productId } : {}),
        },
        select: {
          id: true,
          type: true,
          quantity: true,
          reason: true,
          createdAt: true,
          product: { select: { id: true, name: true, sku: true } },
          staff: { select: { fullName: true } },
          invoiceItem: { select: { invoice: { select: { invoiceNo: true, sessionId: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        take: input.take ?? 200,
      })

      return rows.map(toStockMovementRow)
    },

    async deactivate(id) {
      await store.product.update({ where: { id }, data: { isActive: false } })
    },

    async delete(id) {
      await store.product.delete({ where: { id } })
    },

    async countUsage(id) {
      const result = await store.product.findUnique({
        where: { id },
        select: {
          _count: {
            select: {
              stockMovements: true,
              invoiceItems: true,
              sellItems: true,
            }
          }
        }
      })
      if (!result) return 0
      const c = result._count
      return c.stockMovements + c.invoiceItems + c.sellItems
    },
  }
}
