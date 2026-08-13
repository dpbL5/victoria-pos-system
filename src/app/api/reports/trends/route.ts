import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/shared/auth'
import { repositories } from '@/lib/infrastructure/repositories'
import { toInputDate, parseStartOfDay, parseEndOfDay } from '@/lib/shared/utils'

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

    const data = await repositories.reporting.getTrends({
      from: fromDate,
      to: toDate,
      scope: auth.role === 'STAFF' ? 'STAFF' : 'ALL',
      staffId: auth.userId,
    })

    return NextResponse.json({ success: true, data })
  } catch (error) {
    if ((error as Error).message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 })
    }
    console.error('GET /api/reports/trends error:', error)

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
