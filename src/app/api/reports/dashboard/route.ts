import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { findOpenOperationalShift, findOpenShiftForStaff } from '@/lib/business/shifts'
import { prisma } from '@/lib/prisma'
import { parseStartOfDay, toInputDate } from '@/lib/utils'
import { Prisma } from '@/generated/prisma/client'
import type { DashboardStats } from '@/types'

type PaymentMethodKey = 'CASH' | 'TRANSFER' | 'CARD' | 'MEMBER'
type ItemTypeKey = 'PLAY_TIME' | 'MEMBERSHIP_FEE' | 'PRODUCT' | 'SERVICE' | 'DISCOUNT' | 'SURCHARGE'

const paymentMethods: PaymentMethodKey[] = ['CASH', 'TRANSFER', 'CARD', 'MEMBER']
const itemTypes: ItemTypeKey[] = ['PLAY_TIME', 'MEMBERSHIP_FEE', 'PRODUCT', 'SERVICE', 'DISCOUNT', 'SURCHARGE']

export async function GET() {
  try {
    const auth = await requireAuth()
    const { start, end } = getTodayRange()
    const paymentWhere: Prisma.PaymentWhereInput = {
      paidAt: { gte: start, lt: end },
      invoice: { status: { not: 'CANCELLED' } },
    }
    if (auth.role === 'STAFF') paymentWhere.staffId = auth.userId
    const invoiceWhere: Prisma.InvoiceWhereInput = {
      paidAt: { gte: start, lt: end },
      status: { not: 'CANCELLED' },
    }
    if (auth.role === 'STAFF') invoiceWhere.staffId = auth.userId

    const currentShift = auth.role === 'ADMIN'
      ? await findOpenOperationalShift(prisma)
      : await findOpenShiftForStaff(prisma, auth.userId)
    const currentShiftId = currentShift?.id

    // ── Batch 1: Core today stats (5-6 queries) ──
    const [
      todayPayments,
      todayPaymentCount,
      todayInvoices,
      todaySessions,
      completedSessions,
      activeSessions,
      totalCustomersToday,
    ] = await Promise.all([
      prisma.payment.aggregate({
        where: paymentWhere,
        _sum: { grandTotal: true },
      }),
      prisma.payment.count({ where: paymentWhere }),
      prisma.invoice.count({ where: invoiceWhere }),
      prisma.session.count({
        where: {
          createdAt: { gte: start, lt: end },
          ...(auth.role === 'STAFF' ? { staffId: auth.userId } : {}),
        },
      }),
      prisma.session.count({
        where: {
          status: 'COMPLETED',
          endTime: { gte: start, lt: end },
          ...(auth.role === 'STAFF' ? { staffId: auth.userId } : {}),
        },
      }),
      prisma.session.count({
        where: {
          status: 'ACTIVE',
          ...(auth.role === 'STAFF' ? { staffId: auth.userId } : {}),
        },
      }),
      prisma.customer.count({
        where: { createdAt: { gte: start, lt: end } },
      }),
    ])

    // ── Batch 2: Breakdowns today + shift (4-6 queries) ──
    const [
      todayPaymentMethods,
      todayItemTypes,
      shiftPayments,
      shiftPaymentCount,
      shiftPaymentMethods,
      shiftItemTypes,
      shiftActiveSessions,
      shiftCompletedSessions,
    ] = await Promise.all([
      prisma.payment.groupBy({
        by: ['paymentMethod'],
        where: paymentWhere,
        _sum: { grandTotal: true },
        _count: { _all: true },
      }),
      prisma.invoiceItem.groupBy({
        by: ['type'],
        where: { invoice: invoiceWhere },
        _sum: { total: true },
      }),
      currentShiftId
        ? prisma.payment.aggregate({
            where: { shiftId: currentShiftId, invoice: { status: { not: 'CANCELLED' as const } } },
            _sum: { grandTotal: true },
          })
        : Promise.resolve(null),
      currentShiftId
        ? prisma.payment.count({ where: { shiftId: currentShiftId, invoice: { status: { not: 'CANCELLED' as const } } } })
        : Promise.resolve(0),
      currentShiftId
        ? prisma.payment.groupBy({
            by: ['paymentMethod'],
            where: { shiftId: currentShiftId, invoice: { status: { not: 'CANCELLED' as const } } },
            _sum: { grandTotal: true },
            _count: { _all: true },
          })
        : Promise.resolve([]),
      currentShiftId
        ? prisma.invoiceItem.groupBy({
            by: ['type'],
            where: { invoice: { shiftId: currentShiftId, status: { not: 'CANCELLED' as const } } },
            _sum: { total: true },
          })
        : Promise.resolve([]),
      currentShiftId
        ? prisma.session.count({ where: { shiftId: currentShiftId, status: 'ACTIVE' } })
        : Promise.resolve(0),
      currentShiftId
        ? prisma.session.count({ where: { shiftId: currentShiftId, status: 'COMPLETED' } })
        : Promise.resolve(0),
    ])

    const todayRevenue = Number(todayPayments._sum?.grandTotal ?? 0)
    const todayPaymentBreakdown = normalizePaymentBreakdown(todayPaymentMethods as any)
    const todayItemBreakdown = normalizeItemBreakdown(todayItemTypes as any)
    const shiftPaymentBreakdown = normalizePaymentBreakdown(shiftPaymentMethods as any)
    const shiftItemBreakdown = normalizeItemBreakdown(shiftItemTypes as any)
    const shiftCash = shiftPaymentBreakdown.CASH.total
    const shiftRevenue = Number(shiftPayments?._sum?.grandTotal ?? 0)

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
      todaySessions,
      activeSessions,
      totalCustomersToday,
      scope: auth.role === 'STAFF' ? 'STAFF' : 'ALL',
      today: {
        revenue: todayRevenue,
        paymentCount: todayPaymentCount,
        invoiceCount: todayInvoices,
        sessionsCreated: todaySessions,
        completedSessions,
        activeSessions,
        newCustomers: totalCustomersToday,
        averagePayment: todayPaymentCount > 0 ? Math.round(todayRevenue / todayPaymentCount) : 0,
        byPaymentMethod: todayPaymentBreakdown,
        byItemType: todayItemBreakdown,
      },
      currentShift: currentShift
        ? {
            id: currentShift.id,
            openedAt: currentShift.openedAt,
            openingCash: Number(currentShift.openingCash),
            revenue: shiftRevenue,
            cashRevenue: shiftCash,
            expectedCash: Number(currentShift.openingCash) + shiftCash,
            paymentCount: shiftPaymentCount,
            activeSessions: shiftActiveSessions,
            completedSessions: shiftCompletedSessions,
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
  rows: Array<{
    paymentMethod: PaymentMethodKey
    _sum: { grandTotal: unknown }
    _count: { _all: number }
  }>
): Record<PaymentMethodKey, { total: number; count: number }> {
  const empty = Object.fromEntries(
    paymentMethods.map((method) => [method, { total: 0, count: 0 }])
  ) as Record<PaymentMethodKey, { total: number; count: number }>

  for (const row of rows) {
    empty[row.paymentMethod] = {
      total: Number(row._sum.grandTotal ?? 0),
      count: row._count._all,
    }
  }

  return empty
}

function normalizeItemBreakdown(
  rows: Array<{
    type: ItemTypeKey
    _sum: { total: unknown }
  }>
): Record<ItemTypeKey, number> {
  const empty = Object.fromEntries(
    itemTypes.map((type) => [type, 0])
  ) as Record<ItemTypeKey, number>

  for (const row of rows) {
    empty[row.type] = Number(row._sum.total ?? 0)
  }

  return empty
}
