import { NextRequest } from 'next/server'
import { requireMutationAuth } from '@/lib/shared/auth'
import { isAdminOnly } from '@/lib/shared/roles'
import { editInvoice, mapEditInvoiceError } from '@/lib/invoicing'
import { editInvoiceSchema } from '@/lib/invoicing'
import {
  apiError,
  resultToResponse,
  ERR_UNAUTHORIZED,
  ERR_FORBIDDEN,
  ERR_CSRF,
} from '@/lib/infrastructure/api-helpers'

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
    if (!isAdminOnly(auth.role)) {
      return apiError({ code: 'FORBIDDEN', message: 'Chỉ quản trị viên được sửa hoá đơn', status: 403 })
    }

    const { id } = await params

    if (!UUID_RE.test(id)) {
      return apiError({ code: 'VALIDATION', message: 'ID hoá đơn không hợp lệ', status: 400 })
    }

    const body = await request.json()
    const parsed = editInvoiceSchema.safeParse(body)

    if (!parsed.success) {
      return apiError({ code: 'VALIDATION', message: parsed.error.issues[0].message, status: 400 })
    }

    const result = await editInvoice({
      invoiceId: id,
      staffId: auth.userId,
      items: parsed.data.items,
      paymentMethod: parsed.data.paymentMethod,
      notes: parsed.data.notes,
    })

    return resultToResponse(result, mapEditInvoiceError, 201)
  } catch (error) {
    const message = (error as Error).message
    if (message === 'UNAUTHORIZED') return apiError(ERR_UNAUTHORIZED)
    if (message === 'CSRF_MISMATCH') return apiError(ERR_CSRF)
    console.error('POST /api/invoices/[id]/edit error:', error)
    return apiError({ code: 'SERVER_ERROR', message: 'Lỗi máy chủ', status: 500 })
  }
}
