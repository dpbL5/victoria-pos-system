import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/shared/auth'
import { repositories } from '@/lib/infrastructure/repositories'
import { parseStartOfDay, toInputDate } from '@/lib/shared/utils'
import type { DashboardStats } from '@/types'
import type { ItemTypeRow, PaymentMethodRow } from '@/lib/reports'

type PaymentMethodKey = 'CASH' | 'TRANSFER' | 'CARD' | 'MEMBER'
type ItemTypeKey = 'PLAY_TIME' | 'MEMBERSHIP_FEE' | 'PRODUCT' | 'SERVICE' | 'DISCOUNT' | 'SURCHARGE'

const paymentMethods: PaymentMethodKey[] = ['CASH', 'TRANSFER', 'CARD', 'MEMBER']
const itemTypes: ItemTypeKey[] = ['PLAY_TIME', 'MEMBERSHIP_FEE', 'PRODUCT', 'SERVICE', 'DISCOUNT', 'SURCHARGE']

export async function GET() {
  try {
    const auth = await requireAuth()
    const { start, end } = getTodayRange()
    const scope = auth.role === 'STAFF' ? 'STAFF' : 'ALL'

    const currentShift = auth.role === 'ADMIN'
      ? await repositories.shift.findOpenOperational()
      : await repositories.shift.findOpenForStaff(auth.userId)
    const currentShiftId = currentShift?.id ?? null

    const data = await repositories.reporting.getDashboardData({
      start,
      end,
      scope: auth.role === 'STAFF' ? 'STAFF' : 'ALL',
      staffId: auth.userId,
      currentShiftId,
    })

    const todayRevenue = data.today.revenue
    const todayPaymentBreakdown = normalizePaymentBreakdown(data.today.byPaymentMethod)
    const todayItemBreakdown = normalizeItemBreakdown(data.today.byItemType)
    const shiftPaymentBreakdown = normalizePaymentBreakdown(data.shift?.byPaymentMethod ?? [])
    const shiftItemBreakdown = normalizeItemBreakdown(data.shift?.byItemType ?? [])
    const shiftCash = shiftPaymentBreakdown.CASH.total
    const shiftRevenue = data.shift?.revenue ?? 0

    const stats: DashboardStats & {
      scope: 'STAFF' | 'ALL'
      today: {
        revenue: number
        paymentCount: number
        invoiceCount: number
        sessionsCreated: number
        completedSessions: number
        activeSessions: number
        newCustomers: number
        averagePayment: number
        byPaymentMethod: Record<PaymentMethodKey, { total: number; count: number }>
        byItemType: Record<ItemTypeKey, number>
      }
      currentShift: null | {
        id: string
        openedAt: Date
        openingCash: number
        revenue: number
        cashRevenue: number
        expectedCash: number
        paymentCount: number
        activeSessions: number
        completedSessions: number
        byPaymentMethod: Record<PaymentMethodKey, { total: number; count: number }>
        byItemType: Record<ItemTypeKey, number>
      }
    } = {
      todayRevenue,
      todaySessions: data.today.sessionsCreated,
      activeSessions: data.today.activeSessions,
      totalCustomersToday: data.today.newCustomers,
      scope: scope === 'STAFF' ? 'STAFF' : 'ALL',
      today: {
        revenue: todayRevenue,
        paymentCount: data.today.paymentCount,
        invoiceCount: data.today.invoiceCount,
        sessionsCreated: data.today.sessionsCreated,
        completedSessions: data.today.completedSessions,
        activeSessions: data.today.activeSessions,
        newCustomers: data.today.newCustomers,
        averagePayment: data.today.paymentCount > 0 ? Math.round(todayRevenue / data.today.paymentCount) : 0,
        byPaymentMethod: todayPaymentBreakdown,
        byItemType: todayItemBreakdown,
      },
      currentShift: currentShift && data.shift
        ? {
            id: currentShift.id,
            openedAt: currentShift.openedAt,
            openingCash: Number(currentShift.openingCash),
            revenue: shiftRevenue,
            cashRevenue: shiftCash,
            expectedCash: Number(currentShift.openingCash) + shiftCash,
            paymentCount: data.shift.paymentCount,
            activeSessions: data.shift.activeSessions,
            completedSessions: data.shift.completedSessions,
            byPaymentMethod: shiftPaymentBreakdown,
            byItemType: shiftItemBreakdown,
          }
        : null,
    }

    return NextResponse.json({ success: true, data: stats })
  } catch (error) {
    if ((error as Error).message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 })
    }
    console.error('GET /api/reports/dashboard error:', error)

    // ── Phân biệt lỗi kết nối DB (Supabase free tier) vs lỗi khác ──
    const message = (error as Error).message ?? ''
    if (
      message.includes('Connection terminated') ||
      message.includes('Connection pool') ||
      message.includes('too many clients') ||
      message.includes('remaining connection slots') ||
      message.includes('Connection reset') ||
      message.includes('ECONNRESET') ||
      message.includes('ETIMEDOUT') ||
      message.includes('connect ETIMEDOUT')
    ) {
      return NextResponse.json(
        {
          success: false,
          error: 'Không kết nối được database. Supabase free tier có thể đang quá tải — vui lòng thử lại sau vài giây.',
        },
        { status: 503 }
      )
    }

    return NextResponse.json({ success: false, error: 'Lỗi máy chủ' }, { status: 500 })
  }
}

function getTodayRange() {
  const todayStr = toInputDate(new Date())
  const start = parseStartOfDay(todayStr)
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)
  return { start, end }
}

function normalizePaymentBreakdown(
  rows: PaymentMethodRow[]
): Record<PaymentMethodKey, { total: number; count: number }> {
  const empty = Object.fromEntries(
    paymentMethods.map((method) => [method, { total: 0, count: 0 }])
  ) as Record<PaymentMethodKey, { total: number; count: number }>

  for (const row of rows) {
    if (!row.paymentMethod || !row._sum || !row._count) continue
    const method = row.paymentMethod as PaymentMethodKey
    if (!(method in empty)) continue
    empty[method] = {
      total: Number(row._sum.grandTotal ?? 0),
      count: row._count._all,
    }
  }

  return empty
}

function normalizeItemBreakdown(
  rows: ItemTypeRow[]
): Record<ItemTypeKey, number> {
  const empty = Object.fromEntries(
    itemTypes.map((type) => [type, 0])
  ) as Record<ItemTypeKey, number>

  for (const row of rows) {
    if (!row.type || !row._sum) continue
    const type = row.type as ItemTypeKey
    if (!(type in empty)) continue
    empty[type] = Number(row._sum.total ?? 0)
  }

  return empty
}
