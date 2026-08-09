import { NextRequest } from 'next/server'
import { requireAdmin, requireMutationAuth } from '@/lib/shared/auth'
import { getShiftTransactions, getShiftRevenueData, adjustShiftCashDifference, mapAdjustShiftCashDifferenceError } from '@/lib/shifts'
import { repositories } from '@/lib/infrastructure/repositories'
import { adjustCashDifferenceSchema } from '@/lib/shifts'
import type { ShiftReportDetail } from '@/types'
import {
  apiError,
  apiSuccess,
  resultToResponse,
  ERR_UNAUTHORIZED,
  ERR_FORBIDDEN,
  ERR_CSRF,
} from '@/lib/infrastructure/api-helpers'

type PaymentMethodKey = 'CASH' | 'TRANSFER' | 'CARD' | 'MEMBER'
type ItemTypeKey = 'PLAY_TIME' | 'MEMBERSHIP_FEE' | 'PRODUCT' | 'SERVICE' | 'DISCOUNT' | 'SURCHARGE'

const paymentMethods: PaymentMethodKey[] = ['CASH', 'TRANSFER', 'CARD', 'MEMBER']
const itemTypes: ItemTypeKey[] = ['PLAY_TIME', 'MEMBERSHIP_FEE', 'PRODUCT', 'SERVICE', 'DISCOUNT', 'SURCHARGE']

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin()
    const { id } = await params

    const shift = await repositories.shift.findByIdWithToolStats(id)

    if (!shift) {
      return apiError({ code: 'SHIFT_NOT_FOUND', message: 'Không tìm thấy ca làm', status: 404 })
    }

    const [revenue, txResult, itemTypeRows] = await Promise.all([
      getShiftRevenueData(repositories as never, id),
      getShiftTransactions(repositories as never, id),
      (repositories as never as { invoiceItem: import('@/generated/prisma/client').Prisma.InvoiceItemDelegate }).invoiceItem.groupBy({
        by: ['type'],
        where: { invoice: { shiftId: id, status: { not: 'CANCELLED' } } },
        _sum: { total: true },
      }),
    ])

    const byPaymentMethod = Object.fromEntries(
      paymentMethods.map((m) => [m, { total: 0, count: 0 }])
    ) as Record<PaymentMethodKey, { total: number; count: number }>

    for (const tx of txResult.transactions) {
      if (tx.invoiceStatus === 'CANCELLED') continue
      const method = tx.paymentMethod as PaymentMethodKey
      if (byPaymentMethod[method]) {
        byPaymentMethod[method].total += tx.amount
        byPaymentMethod[method].count++
      }
    }

    const byItemType = Object.fromEntries(
      itemTypes.map((t) => [t, 0])
    ) as Record<ItemTypeKey, number>

    for (const row of itemTypeRows) {
      byItemType[row.type as ItemTypeKey] = Number(row._sum?.total ?? 0)
    }

    const detail: ShiftReportDetail = {
      id: shift.id,
      openedAt: shift.openedAt.toISOString(),
      closedAt: shift.closedAt?.toISOString() ?? null,
      openingCash: Number(shift.openingCash),
      closingCash: shift.closingCash != null ? Number(shift.closingCash) : null,
      expectedCash: shift.expectedCash != null ? Number(shift.expectedCash) : null,
      cashDifference: shift.cashDifference != null ? Number(shift.cashDifference) : null,
      status: shift.status as 'OPEN' | 'CLOSED',
      notes: shift.notes,
      staff: { id: shift.staff.id, fullName: shift.staff.fullName },
      totalRevenue: revenue.totalRevenue,
      cashRevenue: revenue.cashRevenue,
      transferRevenue: revenue.transferRevenue,
      cardRevenue: revenue.cardRevenue,
      memberRevenue: revenue.memberRevenue,
      paymentCount: revenue.paymentCount,
      membershipCount: revenue.membershipCount,
      sessionCount: shift._count.sessions,
      participants: shift.participants.map((p) => ({
        id: p.id,
        role: p.role as 'LEAD' | 'STAFF',
        joinedAt: p.joinedAt.toISOString(),
        leftAt: p.leftAt?.toISOString() ?? null,
        staff: { id: p.staff.id, fullName: p.staff.fullName },
      })),
      byPaymentMethod,
      byItemType,
      transactions: txResult.transactions,
      toolCounts: shift.toolCounts.map((tc) => ({
        id: tc.id,
        toolId: tc.toolId,
        tool: tc.tool,
        openCount: tc.openCount,
        closeCount: tc.closeCount,
      })),
    }

    return apiSuccess(detail)
  } catch (error) {
    if ((error as Error).message === 'UNAUTHORIZED') return apiError(ERR_UNAUTHORIZED)
    if ((error as Error).message === 'FORBIDDEN') return apiError(ERR_FORBIDDEN)
    console.error('GET /api/reports/shifts/[id] error:', error)
    return apiError({ code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireMutationAuth(request)
    if (auth.role !== 'ADMIN') {
      return apiError({ code: 'FORBIDDEN', message: 'Chỉ quản trị viên được điều chỉnh', status: 403 })
    }

    const { id } = await params
    const body = await request.json()
    const parsed = adjustCashDifferenceSchema.safeParse(body)

    if (!parsed.success) {
      return apiError({ code: 'VALIDATION', message: parsed.error.issues[0].message, status: 400 })
    }

    const result = await adjustShiftCashDifference({
      shiftId: id,
      staffId: auth.userId,
      cashDifference: parsed.data.cashDifference,
      notes: parsed.data.notes,
    })
    return resultToResponse(result, mapAdjustShiftCashDifferenceError)
  } catch (error) {
    const message = (error as Error).message
    if (message === 'UNAUTHORIZED') return apiError(ERR_UNAUTHORIZED)
    if (message === 'CSRF_MISMATCH') return apiError(ERR_CSRF)
    console.error('PATCH /api/reports/shifts/[id] error:', error)
    return apiError({ code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 })
  }
}
