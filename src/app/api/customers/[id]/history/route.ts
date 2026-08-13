// ── GET /api/customers/[id]/history — lịch sử thanh toán của khách ─────
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/shared/auth'
import { repositories } from '@/lib/infrastructure/repositories'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth()
    const { id } = await params

    const customer = await repositories.customer.findById(id)
    if (!customer) {
      return NextResponse.json(
        { success: false, error: 'Không tìm thấy khách hàng' },
        { status: 404 }
      )
    }

    const invoices = await repositories.billing.findInvoicesByCustomer(id)

    return NextResponse.json({
      success: true,
      data: {
        invoices,
        totalSpent: customer.totalSpent,
        totalHoursPlayed: customer.totalHoursPlayed,
      },
    })
  } catch (error) {
    if ((error as Error).message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 })
    }
    console.error('GET /api/customers/[id]/history error:', error)
    return NextResponse.json({ success: false, error: 'Lỗi máy chủ' }, { status: 500 })
  }
}
