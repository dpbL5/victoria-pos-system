import { NextRequest } from 'next/server'
import { requireAuth, requireMutationAuth } from '@/lib/shared/auth'
import { checkIn, mapCheckInError } from '@/lib/sessions'
import { repositories } from '@/lib/infrastructure/repositories'
import { createSessionSchema } from '@/lib/sessions'
import {
  apiSuccess,
  apiError,
  resultToResponse,
  ERR_UNAUTHORIZED,
  ERR_CSRF,
} from '@/lib/infrastructure/api-helpers'

export async function GET(request: NextRequest) {
  try {
    await requireAuth()

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') || undefined
    const customerId = searchParams.get('customerId') || undefined
    const date = searchParams.get('date') || undefined
    const page = clampPositiveInt(searchParams.get('page'), 1, 1, 500)
    const limit = clampPositiveInt(searchParams.get('limit'), 20, 1, 100)
    const skip = (page - 1) * limit

    const { rows: data, total } = await repositories.session.findMany({
      status,
      customerId,
      date,
      skip,
      take: limit,
    })

    // ── Tính tổng tiền bán kèm chưa thanh toán (SessionSellItem) cho từng phiên ──
    const sessionIds = data.map((s) => s.id)
    const sellItemTotals = await repositories.session.findSellItemTotals(sessionIds)

    const enriched = data.map((s) => ({
      ...s,
      pendingSellTotal: sellItemTotals[s.id] ?? 0,
    }))

    return apiSuccess(enriched, 200)
  } catch (error) {
    if ((error as Error).message === 'UNAUTHORIZED') return apiError(ERR_UNAUTHORIZED)
    console.error('GET /api/sessions error:', error)
    return apiError({ code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 })
  }
}

function clampPositiveInt(
  value: string | null,
  fallback: number,
  min: number,
  max: number
): number {
  const parsed = Number.parseInt(value || '', 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireMutationAuth(request)

    const body = await request.json()
    const parsed = createSessionSchema.safeParse(body)

    if (!parsed.success) {
      return apiError({ code: 'VALIDATION', message: parsed.error.issues[0].message, status: 400 })
    }

    const session = await checkIn({
      staffId: auth.userId,
      customerId: parsed.data.customerId,
      customerName: parsed.data.customerName,
      customerPhone: parsed.data.customerPhone,
      playerCount: parsed.data.playerCount,
      now: parsed.data.startTime ? new Date(parsed.data.startTime) : undefined,
    })

    return resultToResponse(session, mapCheckInError, 201)
  } catch (error) {
    const message = (error as Error).message
    if (message === 'UNAUTHORIZED') return apiError(ERR_UNAUTHORIZED)
    if (message === 'CSRF_MISMATCH') return apiError(ERR_CSRF)
    console.error('POST /api/sessions error:', error)
    return apiError({ code: 'SERVER_ERROR', message: 'Lỗi máy chủ', status: 500 })
  }
}
