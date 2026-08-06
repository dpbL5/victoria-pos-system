import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { toInputDate, parseStartOfDay, parseEndOfDay } from '@/lib/utils'
import { Prisma } from '@/generated/prisma/client'

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth()
    const { searchParams } = new URL(request.url)
    const from = searchParams.get('from') || toInputDate(new Date())
    const to = searchParams.get('to') || toInputDate(new Date())
    const fromDate = parseStartOfDay(from)
    const toDate = parseEndOfDay(to)

    if (fromDate > toDate) {
      return NextResponse.json(
        { success: false, error: 'Khoảng ngày không hợp lệ' },
        { status: 400 }
      )
    }

    const paymentWhere: Prisma.PaymentWhereInput = {
      paidAt: { gte: fromDate, lte: toDate },
      invoice: { status: { not: 'CANCELLED' } },
    }
    if (auth.role === 'STAFF') paymentWhere.staffId = auth.userId

    const [payments, recentPayments] = await Promise.all([
      prisma.payment.findMany({
        where: paymentWhere,
        orderBy: { paidAt: 'asc' },
      }),
      prisma.payment.findMany({
        where: paymentWhere,
        include: {
          invoice: {
            select: {
              id: true,
              invoiceNo: true,
              customer: { select: { fullName: true } },
            },
          },
          session: {
            select: {
              customer: { select: { fullName: true } },
            },
          },
          staff: { select: { fullName: true } },
        },
        orderBy: { paidAt: 'desc' },
        take: 5,
      }),
    ])

    const grouped: Record<string, { revenue: number; count: number }> = {}
    for (const payment of payments) {
      const key = toInputDate(payment.paidAt)
      if (!grouped[key]) grouped[key] = { revenue: 0, count: 0 }
      grouped[key].revenue += Number(payment.grandTotal)
      grouped[key].count += 1
    }

    const data = Object.entries(grouped).map(([period, value]) => ({
      period,
      revenue: value.revenue,
      sessionCount: value.count,
      avgRevenuePerSession: value.count > 0 ? Math.round(value.revenue / value.count) : 0,
    }))

    const totalRevenue = data.reduce((sum, item) => sum + item.revenue, 0)
    const totalSessions = data.reduce((sum, item) => sum + item.sessionCount, 0)

    return NextResponse.json({
      success: true,
      data,
      summary: {
        from,
        to,
        totalRevenue,
        totalSessions,
        averagePayment: totalSessions > 0 ? Math.round(totalRevenue / totalSessions) : 0,
      },
      payments: recentPayments.map((payment) => ({
        id: payment.id,
        paidAt: payment.paidAt,
        customerName:
          payment.invoice?.customer?.fullName
          ?? payment.session?.customer.fullName
          ?? 'Khách lẻ',
        invoiceId: payment.invoice?.id ?? null,
        invoiceNo: payment.invoice?.invoiceNo ?? null,
        paymentMethod: payment.paymentMethod,
        grandTotal: Number(payment.grandTotal),
        staffName: payment.staff.fullName,
      })),
    })
  } catch (error) {
    if ((error as Error).message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 })
    }
    console.error('GET /api/reports/revenue error:', error)

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

