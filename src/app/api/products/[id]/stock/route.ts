import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { validateCSRF } from '@/lib/csrf'
import { logActivity } from '@/lib/audit'
import { findOpenShiftForStaff } from '@/lib/shifts'
import { prisma } from '@/lib/prisma'
import { stockMovementSchema } from '@/lib/validations/product'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin()
    await validateCSRF(request)
    const { id } = await params

    const body = await request.json()
    const parsed = stockMovementSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0].message },
        { status: 400 }
      )
    }

    if (parsed.data.type === 'RESTOCK' && parsed.data.quantity <= 0) {
      return NextResponse.json(
        { success: false, error: 'Nhập kho phải có số lượng lớn hơn 0' },
        { status: 400 }
      )
    }

    const result = await prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({ where: { id } })
      if (!product) throw new Error('PRODUCT_NOT_FOUND')
      if (product.type === 'SERVICE') throw new Error('SERVICE_HAS_NO_STOCK')

      const nextStock = product.stockQuantity + parsed.data.quantity
      if (nextStock < 0) throw new Error('NEGATIVE_STOCK')

      const openShift = await findOpenShiftForStaff(tx, auth.userId)
      const movement = await tx.stockMovement.create({
        data: {
          productId: product.id,
          shiftId: openShift?.id,
          staffId: auth.userId,
          type: parsed.data.type,
          quantity: parsed.data.quantity,
          unitCost: parsed.data.unitCost,
          reason: parsed.data.reason,
        },
      })

      const updatedProduct = await tx.product.update({
        where: { id: product.id },
        data: { stockQuantity: nextStock },
      })

      await logActivity(tx, {
        userId: auth.userId,
        action: 'STOCK_MOVEMENT',
        entityType: 'Product',
        entityId: product.id,
        details: {
          movementId: movement.id,
          shiftId: openShift?.id ?? null,
          type: movement.type,
          quantity: movement.quantity,
          before: product.stockQuantity,
          after: updatedProduct.stockQuantity,
        },
      })

      return { movement, product: updatedProduct }
    })

    return NextResponse.json({ success: true, data: result })
  } catch (error) {
    const message = (error as Error).message
    if (message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 })
    }
    if (message === 'CSRF_MISMATCH') {
      return NextResponse.json({ success: false, error: 'Yêu cầu không hợp lệ (CSRF)' }, { status: 403 })
    }
    if (message === 'FORBIDDEN') {
      return NextResponse.json({ success: false, error: 'Không có quyền' }, { status: 403 })
    }
    if (message === 'PRODUCT_NOT_FOUND') {
      return NextResponse.json({ success: false, error: 'Không tìm thấy hàng hóa' }, { status: 404 })
    }
    if (message === 'SERVICE_HAS_NO_STOCK') {
      return NextResponse.json({ success: false, error: 'Dịch vụ không quản lý tồn kho' }, { status: 400 })
    }
    if (message === 'NEGATIVE_STOCK') {
      return NextResponse.json({ success: false, error: 'Tồn kho không được âm' }, { status: 400 })
    }
    console.error('POST /api/products/[id]/stock error:', error)
    return NextResponse.json({ success: false, error: 'Lỗi máy chủ' }, { status: 500 })
  }
}
