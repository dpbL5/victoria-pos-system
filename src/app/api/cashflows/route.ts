// ── API: /api/cashflows — quản lý thu chi (admin only) ─────
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/shared/auth'
import { validateCSRF } from '@/lib/shared/csrf'
import { repositories } from '@/lib/infrastructure/repositories'
import { createCashflowSchema } from '@/lib/cashflow/validations'
import { createCashflow, mapCreateCashflowError } from '@/lib/cashflow'
import { currentMonth, monthBounds, monthKey, type Month } from '@/lib/shared/month'
import { parseStartOfDay } from '@/lib/shared/utils'
import { apiError, resultToResponse, ERR_UNAUTHORIZED, ERR_FORBIDDEN, ERR_CSRF } from '@/lib/infrastructure/api-helpers'

/** Đọc `?month=YYYY-MM`, sai/thiếu thì lấy tháng hiện tại. */
function parseMonth(value: string | null): Month {
  if (value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
    return { year: Number(value.slice(0, 4)), month: Number(value.slice(5, 7)) }
  }
  return currentMonth()
}

export async function GET(request: NextRequest) {
  try {
    await requireAdmin()

    const { searchParams } = request.nextUrl
    const typeParam = searchParams.get('type')
    const type =
      typeParam === 'INCOME' || typeParam === 'EXPENSE' ? typeParam : undefined
    const page = Math.max(1, Number(searchParams.get('page')) || 1)
    const pageSize = 10

    const month = parseMonth(searchParams.get('month'))
    const bounds = monthBounds(month)
    const from = parseStartOfDay(bounds.from)
    const to = parseStartOfDay(bounds.to)

    const [result, summary] = await Promise.all([
      repositories.cashflow.list({ type, from, to, page, pageSize }),
      repositories.cashflow.summarize({ type, from, to }),
    ])

    const data = result.entries.map((e) => ({
      id: e.id,
      type: e.type,
      personName: e.personName,
      amount: Number(e.amount),
      reason: e.reason,
      occurredAt: e.occurredAt.toISOString(),
      staff: e.staff,
      createdAt: e.createdAt.toISOString(),
    }))

    return NextResponse.json({
      success: true,
      data: {
        month: monthKey(month),
        entries: data,
        summary: {
          income: summary.income,
          expense: summary.expense,
          balance: summary.income - summary.expense,
        },
        pagination: {
          page: result.page,
          pageSize: result.pageSize,
          total: result.total,
          totalPages: Math.ceil(result.total / result.pageSize),
        },
      },
    })
  } catch (error) {
    const message = (error as Error).message
    if (message === 'UNAUTHORIZED') return apiError(ERR_UNAUTHORIZED)
    if (message === 'FORBIDDEN') return apiError(ERR_FORBIDDEN)
    console.error('GET /api/cashflows error:', error)
    return NextResponse.json({ success: false, error: 'Lỗi máy chủ' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin()
    await validateCSRF(request)

    const body = await request.json()
    const parsed = createCashflowSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0].message },
        { status: 400 }
      )
    }

    const result = await createCashflow({
      ...parsed.data,
      staffId: auth.userId,
    })

    return resultToResponse(result, mapCreateCashflowError, 201)
  } catch (error) {
    const message = (error as Error).message
    if (message === 'UNAUTHORIZED') return apiError(ERR_UNAUTHORIZED)
    if (message === 'CSRF_MISMATCH') return apiError(ERR_CSRF)
    if (message === 'FORBIDDEN') return apiError(ERR_FORBIDDEN)
    console.error('POST /api/cashflows error:', error)
    return NextResponse.json({ success: false, error: 'Lỗi máy chủ' }, { status: 500 })
  }
}
