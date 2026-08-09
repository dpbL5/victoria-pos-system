// ── Use-cases: Sản phẩm & tồn kho (create/apply stock) ─────
import { ok } from '@/lib/shared/result'
import type { DomainError, Result } from '@/lib/shared/result'
import { runInTransaction, fail } from '@/lib/infrastructure/db-helpers'
import type { HttpErrorInfo } from '@/lib/infrastructure/api-helpers'
import type { Repositories } from '@/lib/infrastructure/repositories'
import { repositories } from '@/lib/infrastructure/repositories'
import type { ProductAdminDetail } from '../ports'

// ── Create product ──
export interface CreateProductInput {
  staffId: string
  name: string
  sku: string | null
  type: 'PRODUCT' | 'SERVICE'
  price: number
  costPrice: number | null
  stockQuantity: number
  minStockLevel: number
  isActive: boolean
}

export interface CreateProductResult {
  product: ProductAdminDetail
}

export async function createProduct(
  input: CreateProductInput,
  deps: Repositories = repositories
): Promise<Result<CreateProductResult>> {
  const result = await runInTransaction(async (tx) => {
    const product = await tx.product.createWithInitialStock({
      name: input.name.trim(),
      sku: input.sku?.trim() || null,
      type: input.type,
      price: input.price,
      costPrice: input.costPrice,
      stockQuantity: input.type === 'SERVICE' ? 0 : input.stockQuantity,
      minStockLevel: input.type === 'SERVICE' ? 0 : input.minStockLevel,
      isActive: input.isActive,
      staffId: input.staffId,
    })

    await tx.audit.append({
      userId: input.staffId,
      action: 'PRODUCT_CREATE',
      entityType: 'Product',
      entityId: product.id,
      details: {
        name: product.name,
        sku: product.sku,
        type: product.type,
        stockQuantity: product.stockQuantity,
      },
    })

    return product
  })

  if (!result.ok) return result
  return ok({ product: result.value })
}

export function mapCreateProductError(error: DomainError): HttpErrorInfo {
  switch (error.code) {
    case 'SKU_DUPLICATE':
      return { code: 'SKU_DUPLICATE', message: 'Mã SKU đã tồn tại', status: 400 }
    default:
      return { code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 }
  }
}

// ── Apply stock movement (RESTOCK/ADJUSTMENT) ──
export interface ApplyStockMovementInput {
  productId: string
  staffId: string
  type: 'RESTOCK' | 'ADJUSTMENT'
  quantity: number
  unitCost: number | null
  reason: string | null
  shiftId: string | null
}

export interface ApplyStockMovementResult {
  movementId: string
  product: ProductAdminDetail
  before: number
  after: number
  shiftId: string | null
  type: string
  quantity: number
}

export async function applyStockMovement(
  input: ApplyStockMovementInput,
  deps: Repositories = repositories
): Promise<Result<ApplyStockMovementResult>> {
  const result = await runInTransaction(async (tx) => {
    const product = await tx.product.findByIdAdmin(input.productId)
    if (!product) fail('PRODUCT_NOT_FOUND')
    if (product.type === 'SERVICE') fail('SERVICE_HAS_NO_STOCK')

    const nextStock = product.stockQuantity + input.quantity
    if (nextStock < 0) fail('NEGATIVE_STOCK')

    const movement = await tx.product.applyStockMovement({
      productId: input.productId,
      staffId: input.staffId,
      type: input.type,
      quantity: input.quantity,
      unitCost: input.unitCost,
      reason: input.reason,
      shiftId: input.shiftId,
    })

    await tx.audit.append({
      userId: input.staffId,
      action: 'STOCK_MOVEMENT',
      entityType: 'Product',
      entityId: input.productId,
      details: {
        movementId: movement.movementId,
        shiftId: movement.shiftId,
        type: movement.type,
        quantity: movement.quantity,
        before: movement.before,
        after: movement.after,
      },
    })

    const updatedProduct = await tx.product.findByIdAdmin(input.productId)
    return { ...movement, product: updatedProduct! }
  })

  if (!result.ok) return result
  return ok(result.value)
}

export function mapApplyStockMovementError(error: DomainError): HttpErrorInfo {
  switch (error.code) {
    case 'PRODUCT_NOT_FOUND':
      return { code: 'PRODUCT_NOT_FOUND', message: 'Không tìm thấy hàng hóa', status: 404 }
    case 'SERVICE_HAS_NO_STOCK':
      return { code: 'SERVICE_HAS_NO_STOCK', message: 'Dịch vụ không quản lý tồn kho', status: 400 }
    case 'NEGATIVE_STOCK':
      return { code: 'NEGATIVE_STOCK', message: 'Tồn kho không được âm', status: 400 }
    default:
      return { code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 }
  }
}
