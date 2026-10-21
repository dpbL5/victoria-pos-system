import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/shared/auth'
import { withApiDiagnostics } from '@/lib/infrastructure/api-diagnostics'
import { repositories } from '@/lib/infrastructure/repositories'
import {
  apiError,
  apiSuccess,
  ERR_UNAUTHORIZED,
} from '@/lib/infrastructure/api-helpers'
import {
  checkoutSelectionSchema,
  mapCheckoutError,
  quoteCheckout,
  toCheckoutSelection,
} from '@/lib/sessions'

function mapPreviewError(error: Parameters<typeof mapCheckoutError>[0]) {
  const info = mapCheckoutError(error)
  // Preview cũ trả 409 cho lỗi bảng giá; giữ hợp đồng đó cho UI.
  return info.code === 'PRICING_RULE_NOT_FOUND' || info.code === 'PRICING_RULE_NOT_EFFECTIVE'
    ? { ...info, status: 409 }
    : info
}

function jsonParam<T>(value: string | null): T | undefined {
  if (!value) return undefined
  try {
    return JSON.parse(value) as T
  } catch {
    return undefined
  }
}

async function getCheckoutPreview(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth()
    const { id } = await params

    const session = await repositories.session.findByIdWithPlayers(id)
    if (!session) {
      return apiError({
        code: 'SESSION_NOT_FOUND',
        message: 'Không tìm thấy phiên',
        status: 404,
      })
    }
    if (session.status !== 'ACTIVE') {
      return apiError({
        code: 'SESSION_NOT_ACTIVE',
        message: 'Chỉ có thể xem tạm tính cho phiên đang chơi',
        status: 400,
      })
    }

    const search = request.nextUrl.searchParams
    const parsedSelection = checkoutSelectionSchema.safeParse({
      groups: jsonParam(search.get('groups')),
      playerIds: jsonParam(search.get('playerIds')),
      groupPricingRuleIds: jsonParam(search.get('groupPricingRuleIds')),
      pricingGroupId: search.get('pricingGroupId') ?? undefined,
      playerCount: search.get('playerCount')
        ? Number(search.get('playerCount'))
        : undefined,
    })
    if (!parsedSelection.success) {
      return apiError({
        code: 'VALIDATION',
        message: parsedSelection.error.issues[0].message,
        status: 400,
      })
    }

    const quoteAt = new Date()
    const endTimeParam = search.get('endTime')
    const endTime = endTimeParam ? new Date(endTimeParam) : quoteAt

    const result = await quoteCheckout(
      repositories,
      session,
      toCheckoutSelection(parsedSelection.data),
      {
        endTime,
        quoteAt,
        promotionRuleId: search.get('promotionRuleId') ?? undefined,
        pricingRuleId: search.get('pricingRuleId') ?? undefined,
      }
    )

    if (!result.ok) return apiError(mapPreviewError(result.error))
    return apiSuccess(result.value.quote)
  } catch (error) {
    if ((error as Error).message === 'UNAUTHORIZED') return apiError(ERR_UNAUTHORIZED)
    console.error('GET /api/sessions/[id]/checkout-preview error:', error)
    return apiError({ code: 'SERVER_ERROR', message: 'Lỗi máy chủ', status: 500 })
  }
}

export const GET = withApiDiagnostics(
  'GET /api/sessions/[id]/checkout-preview',
  getCheckoutPreview
)
