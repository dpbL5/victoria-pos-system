import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/shared/auth'
import { repositories } from '@/lib/infrastructure/repositories'

export async function GET() {
  try {
    await requireAuth()
    const promotions = await repositories.promotions.findAvailable(new Date())

    return NextResponse.json({ success: true, data: promotions })
  } catch (error) {
    if ((error as Error).message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 })
    }

    console.error('GET /api/promotions/available error:', error)
    return NextResponse.json({ success: false, error: 'Lỗi máy chủ' }, { status: 500 })
  }
}
