import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { getShiftTransactions } from '@/lib/shifts'
import { prisma } from '@/lib/prisma'

function csvEscape(value: string | null | undefined): string {
  if (value == null) return '—'
  const str = String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

const paymentMethodLabel: Record<string, string> = {
  CASH: 'Tiền mặt',
  TRANSFER: 'Chuyển khoản',
  CARD: 'Thẻ',
  MEMBER: 'Hội viên',
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin()
    const { id } = await params

    const shift = await prisma.shift.findUnique({
      where: { id },
      select: { id: true, status: true, openedAt: true },
    })

    if (!shift) {
      return NextResponse.json({ success: false, error: 'Không tìm thấy ca làm' }, { status: 404 })
    }

    const { transactions } = await getShiftTransactions(prisma, id)

    const headers = [
      'Thời gian',
      'Mã hóa đơn',
      'Khách hàng',
      'Loại GD',
      'PT thanh toán',
      'Số tiền',
      'Nhân viên',
    ]

    const rows = transactions.map((tx) => [
      csvEscape(tx.paidAt),
      csvEscape(tx.invoiceNo),
      csvEscape(tx.customerName),
      csvEscape(tx.type === 'payment' ? 'Thanh toán' : 'Phí hội viên'),
      csvEscape(tx.paymentMethod ? paymentMethodLabel[tx.paymentMethod] ?? tx.paymentMethod : '—'),
      csvEscape(tx.amount.toString()),
      csvEscape(tx.staffName),
    ])

    const bom = '\uFEFF'
    const csv = bom + [headers, ...rows].map((row) => row.join(',')).join('\n')

    const filename = `giao-dich-ca-${shift.id.slice(0, 8)}.csv`

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (error) {
    if ((error as Error).message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 })
    }
    if ((error as Error).message === 'FORBIDDEN') {
      return NextResponse.json({ success: false, error: 'Chỉ quản trị viên được truy cập' }, { status: 403 })
    }
    console.error('GET /api/reports/shifts/[id]/export error:', error)
    return NextResponse.json({ success: false, error: 'Lỗi máy chủ' }, { status: 500 })
  }
}
