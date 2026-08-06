import { NextRequest, NextResponse } from 'next/server'
import { requireMutationAuth } from '@/lib/auth'
import { editInvoice, mapEditInvoiceError } from '@/lib/business/use-cases/editInvoice'
import { editInvoiceSchema } from '@/lib/validations/invoice'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// POST /api/invoices/[id]/edit
// Chỉ quản trị viên được sửa hoá đơn. Huỷ hoá đơn cũ, tạo hoá đơn mới
// với nội dung đã sửa, hoàn trả và áp dụng lại tồn kho, ghi nhật ký kiểm toán.
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

    const body = await request.json()
    const parsed = editInvoiceSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0].message },
        { status: 400 }
      )
    }

    const result = await editInvoice({
      invoiceId: id,
      staffId: auth.userId,
      items: parsed.data.items,
      paymentMethod: parsed.data.paymentMethod,
      notes: parsed.data.notes,
    })

    return NextResponse.json({ success: true, data: result }, { status: 201 })
  } catch (error) {
    const message = (error as Error).message
    if (message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 })
    }
    if (message === 'CSRF_MISMATCH') {
      return NextResponse.json({ success: false, error: 'Yêu cầu không hợp lệ (CSRF)' }, { status: 403 })
    }
    if (message === 'FORBIDDEN') {
      return NextResponse.json({ success: false, error: 'Chỉ quản trị viên được sửa hoá đơn' }, { status: 403 })
    }
    console.error('POST /api/invoices/[id]/edit error:', error)
    const mapped = mapEditInvoiceError(error as Error)
    return NextResponse.json(
      { success: false, code: mapped.code, error: mapped.message },
      { status: mapped.status }
    )
  }
}
