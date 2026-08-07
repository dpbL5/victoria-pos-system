import { NextRequest, NextResponse } from 'next/server'
import { requireMutationAuth } from '@/lib/auth'
import { voidInvoice, mapVoidInvoiceError } from '@/lib/invoicing'
import { apiError, ERR_UNAUTHORIZED, ERR_CSRF } from '@/lib/infrastructure/api-helpers'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// POST /api/invoices/[id]/void
// Chỉ quản trị viên được huỷ (void) hoá đơn. Chuyển trạng thái CANCELLED,
// hoàn trả tồn kho, ghi nhật ký kiểm toán. Không tạo payment hoàn trả.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireMutationAuth(request)
    if (auth.role !== 'ADMIN') {
      return apiError({ code: 'FORBIDDEN', message: 'Chỉ quản trị viên được huỷ hoá đơn', status: 403 })
    }

    const { id } = await params

    if (!UUID_RE.test(id)) {
      return apiError({ code: 'VALIDATION', message: 'ID hoá đơn không hợp lệ', status: 400 })
    }

    const body = await request.json().catch(() => ({}))
    const reason = body?.reason ? String(body.reason).slice(0, 500).trim() : undefined

    const result = await voidInvoice({
      invoiceId: id,
      staffId: auth.userId,
      reason: reason || undefined,
    })
    if (!result.ok) return apiError(mapVoidInvoiceError(result.error))

    return NextResponse.json({
      success: true,
      message: 'Đã huỷ hoá đơn',
    })
  } catch (error) {
    const message = (error as Error).message
    if (message === 'UNAUTHORIZED') return apiError(ERR_UNAUTHORIZED)
    if (message === 'CSRF_MISMATCH') return apiError(ERR_CSRF)
    console.error('POST /api/invoices/[id]/void error:', error)
    return apiError({ code: 'SERVER_ERROR', message: 'Lỗi máy chủ', status: 500 })
  }
}
