import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@/generated/prisma/client'
import { requireAdmin, requireAuth } from '@/lib/auth'
import { validateCSRF } from '@/lib/csrf'
import { logActivity } from '@/lib/audit'
import { prisma } from '@/lib/prisma'
import { createProductSchema } from '@/lib/validations/product'

export async function GET(request: NextRequest) {
  try {
    await requireAuth()

    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || ''
    const isActive = searchParams.get('isActive')

    const products = await prisma.product.findMany({
      where: {
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { sku: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
        ...(isActive ? { isActive: isActive === 'true' } : {}),
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
      take: 100,
    })

    return NextResponse.json({ success: true, data: products })
  } catch (error) {
    if ((error as Error).message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 })
    }
    console.error('GET /api/products error:', error)
    return NextResponse.json({ success: false, error: 'Lỗi máy chủ' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin()
    await validateCSRF(request)
    const body = await request.json()
    const parsed = createProductSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0].message },
        { status: 400 }
      )
    }

    const product = await prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: {
          name: parsed.data.name.trim(),
          sku: parsed.data.sku?.trim() || null,
          type: parsed.data.type,
          price: parsed.data.price,
          costPrice: parsed.data.costPrice,
          stockQuantity: parsed.data.type === 'SERVICE' ? 0 : parsed.data.stockQuantity,
          minStockLevel: parsed.data.type === 'SERVICE' ? 0 : parsed.data.minStockLevel,
          isActive: parsed.data.isActive,
        },
      })

      if (created.type === 'PRODUCT' && created.stockQuantity > 0) {
        await tx.stockMovement.create({
          data: {
            productId: created.id,
            staffId: auth.userId,
            type: 'RESTOCK',
            quantity: created.stockQuantity,
            unitCost: parsed.data.costPrice,
            reason: 'Tồn đầu kỳ',
          },
        })
      }

      await logActivity(tx, {
        userId: auth.userId,
        action: 'PRODUCT_CREATE',
        entityType: 'Product',
        entityId: created.id,
        details: {
          name: created.name,
          sku: created.sku,
          type: created.type,
          stockQuantity: created.stockQuantity,
        },
      })

      return created
    })

    return NextResponse.json({ success: true, data: product }, { status: 201 })
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
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json({ success: false, error: 'Mã SKU đã tồn tại' }, { status: 400 })
    }
    console.error('POST /api/products error:', error)
    return NextResponse.json({ success: false, error: 'Lỗi máy chủ' }, { status: 500 })
  }
}
