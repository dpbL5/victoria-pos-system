import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/shared/auth'
import { isAdminOnly } from '@/lib/shared/roles'
import { repositories } from '@/lib/infrastructure/repositories'
import { toCsv } from '@/lib/shared/csv'
import { toInputDate, parseStartOfDay, parseEndOfDay } from '@/lib/shared/utils'

const paymentMethodLabel: Record<string, string> = {
  CASH: 'Tiền mặt',
  TRANSFER: 'Chuyển khoản',
  CARD: 'Thẻ',
  MEMBER: 'Hội viên',
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (!isAdminOnly(auth.role)) {
      return NextResponse.json({ success: false, error: 'Không có quyền' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') || 'revenue'
    const from = searchParams.get('from') || toInputDate(new Date())
    const to = searchParams.get('to') || toInputDate(new Date())
    const fromDate = parseStartOfDay(from)
    const toDate = parseEndOfDay(to)

    const csvData = type === 'sessions'
      ? await buildSessionsCsv(fromDate, toDate)
      : await buildRevenueCsv(fromDate, toDate)

    return new NextResponse(csvData, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${type}_${from}_${to}.csv"`,
      },
    })
  } catch (error) {
    const message = (error as Error).message
    if (message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 })
    }
    if (message === 'FORBIDDEN') {
      return NextResponse.json({ success: false, error: 'Không có quyền' }, { status: 403 })
    }
    console.error('GET /api/reports/export error:', error)
    return NextResponse.json({ success: false, error: 'Lỗi máy chủ' }, { status: 500 })
  }
}

async function buildRevenueCsv(fromDate: Date, toDate: Date): Promise<string> {
  const payments = await repositories.reporting.getRevenueExportRows(fromDate, toDate)

  const rows = [
    ['Thời gian', 'Mã hóa đơn', 'Khách hàng', 'Tổng giờ', 'Tạm tính', 'Giảm giá', 'Tổng tiền', 'PT thanh toán', 'Nhân viên'],
  ]

  for (const payment of payments) {
    rows.push([
      payment.paidAt.toISOString(),
      payment.invoice?.invoiceNo ?? '',
      payment.invoice?.customer?.fullName
      ?? payment.session?.customerName
      ?? payment.session?.customer?.fullName
      ?? '',
      String(Number(payment.totalHours)),
      String(Number(payment.subtotal)),
      String(Number(payment.discountTotal)),
      String(Number(payment.grandTotal)),
      paymentMethodLabel[payment.paymentMethod ?? ''] ?? payment.paymentMethod ?? '',
      payment.staff?.fullName ?? '',
    ])
  }

  return toCsv(rows)
}

async function buildSessionsCsv(fromDate: Date, toDate: Date): Promise<string> {
  const sessions = await repositories.reporting.getSessionExportRows(fromDate, toDate)

  const rows = [
    ['Ngày tạo', 'Khách hàng', 'Loại khách', 'Trạng thái', 'Bắt đầu', 'Kết thúc', 'Tổng giờ', 'Tổng tiền', 'Nhân viên'],
  ]

  for (const session of sessions) {
    rows.push([
      toInputDate(session.createdAt),
      session.customerName ?? session.customer?.fullName ?? '',
      session.customer?.type ?? '',
      session.status,
      session.startTime.toISOString(),
      session.endTime?.toISOString() || '',
      String(Number(session.totalHours ?? 0)),
      String(Number(session.totalAmount ?? 0)),
      session.staff?.fullName ?? '',
    ])
  }

  return toCsv(rows)
}
