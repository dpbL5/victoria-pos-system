import { NextRequest, NextResponse } from 'next/server'
import { requireMutationAuth } from '@/lib/auth'
import { voidInvoice } from '@/lib/business/use-cases/voidInvoice'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// POST /api/invoices/[id]/void
// Chỉ quản trị viên được huỷ (void) hoá đơn. Huỷ không xoá cứng mà chuyển
// trạng thái CANCELLED + tạo các mục điều chỉnh (stock return, refund payment)
// và ghi nhật ký hoạt động. Áp dụng cho ca đang mở và ca đã đóng (điều chỉnh
// bản ghi trên ca đã đóng vẫn được ghi nhận kiểm toán).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireMutationAuth(request)
    if (auth.role !== 'ADMIN') {
      throw new Error('FORBIDDEN')
    }

    const { id } = await params

    if (!UUID_RE.test(id)) {
      return NextResponse.json(
        { success: false, error: 'ID hoá đơn không hợp lệ' },
        { status: 400 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const reason = body?.reason ? String(body.reason).slice(0, 500).trim() : undefined

    const result = await voidInvoice({
      invoiceId: id,
      staffId: auth.userId,
      reason: reason || undefined,
    })

    return NextResponse.json({
      success: true,
      data: result,
      message: 'Đã huỷ hoá đơn',
    })
  } catch (error) {
    const message = (error as Error).message
    if (message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 })
    }
    if (message === 'CSRF_MISMATCH') {
      return NextResponse.json({ success: false, error: 'Yêu cầu không hợp lệ (CSRF)' }, { status: 403 })
    }
    if (message === 'FORBIDDEN') {
      return NextResponse.json({ success: false, error: 'Chỉ quản trị viên được huỷ hoá đơn' }, { status: 403 })
    }
    if (message === 'INVOICE_NOT_FOUND') {
      return NextResponse.json({ success: false, error: 'Không tìm thấy hoá đơn' }, { status: 404 })
    }
    if (message === 'INVOICE_NOT_VOIDABLE') {
      return NextResponse.json({ success: false, error: 'Chỉ có thể huỷ hoá đơn đã thanh toán (trạng thái PAID)' }, { status: 409 })
    }
    if (message === 'SHIFT_CLOSED') {
      return NextResponse.json(
        {
          success: false,
          error: 'Hoá đơn chưa gán ca thanh toán, không thể ghi nhận hoàn trả.',
        },
        { status: 409 }
      )
    }
    console.error('POST /api/invoices/[id]/void error:', error)
    return NextResponse.json({ success: false, error: 'Lỗi máy chủ' }, { status: 500 })
  }
}
