// ── DELETE /api/products/[id] — xoá/deactivate hàng hóa (admin/manager) ─────
import { NextRequest } from 'next/server'
import { requireMutationAuth } from '@/lib/shared/auth'
import { isManagerOrAdmin } from '@/lib/shared/roles'
import { validateCSRF } from '@/lib/shared/csrf'
import { deleteProduct, mapDeleteProductError } from '@/lib/sessions'
import { apiError, ERR_UNAUTHORIZED, ERR_FORBIDDEN, ERR_CSRF } from '@/lib/infrastructure/api-helpers'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireMutationAuth(request)
    if (!isManagerOrAdmin(auth.role)) {
      return apiError({ code: 'FORBIDDEN', message: 'Không có quyền', status: 403 })
    }
    await validateCSRF(request)
    const { id } = await params

    const result = await deleteProduct({
      staffId: auth.userId,
      productId: id,
    })

    if (!result.ok) return apiError(mapDeleteProductError(result.error))
    if (result.value.deleted) {
      return new Response(
        JSON.stringify({ success: true, message: 'Đã xóa hàng hóa' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }
    return new Response(
      JSON.stringify({
        success: true,
        message: 'Hàng đã có giao dịch, đã chuyển sang trạng thái ngưng bán',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    const message = (error as Error).message
    if (message === 'UNAUTHORIZED') return apiError(ERR_UNAUTHORIZED)
    if (message === 'CSRF_MISMATCH') return apiError(ERR_CSRF)
    if (message === 'FORBIDDEN') return apiError(ERR_FORBIDDEN)
    console.error('DELETE /api/products/[id] error:', error)
    return apiError({ code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 })
  }
}
