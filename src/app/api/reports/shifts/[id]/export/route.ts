import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/shared/auth'
import { getShiftTransactions } from '@/lib/shifts'
import { repositories } from '@/lib/infrastructure/repositories'
import { prisma } from '@/lib/infrastructure/prisma'
import { toCsv } from '@/lib/shared/csv'

const paymentMethodLabel: Record<string, string> = {
  CASH: 'Tiền mặt',
  TRANSFER: 'Chuyển khoản',
  CARD: 'Thẻ',
  MEMBER: 'Hội viên',
}

function cell(value: string | null | undefined): string {
  return value == null ? '—' : String(value)
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin()
    const { id } = await params

    const shift = await repositories.shift.findByIdExport(id)

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
      cell(tx.paidAt),
      cell(tx.invoiceNo),
      cell(tx.customerName),
      cell(tx.type === 'payment' ? 'Thanh toán' : 'Phí hội viên'),
      cell(tx.paymentMethod ? paymentMethodLabel[tx.paymentMethod] ?? tx.paymentMethod : '—'),
      cell(tx.amount.toString()),
      cell(tx.staffName),
    ])

    const csv = toCsv([headers, ...rows], { bom: true })

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
