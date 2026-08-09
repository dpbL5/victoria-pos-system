import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/shared/auth'
import { repositories } from '@/lib/infrastructure/repositories'

export async function GET(request: NextRequest) {
  try {
    await requireAuth()

    const { searchParams } = new URL(request.url)
    const customerId = searchParams.get('customerId') || undefined

    const [memberships, activeMembership] = await Promise.all([
      repositories.membership.findManyByCustomer(customerId),
      customerId ? repositories.membership.findActive(customerId, new Date()) : Promise.resolve(null),
    ])

    return NextResponse.json({
      success: true,
      data: memberships,
      current: activeMembership,
    })
  } catch (error) {
    if ((error as Error).message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 })
    }
    console.error('GET /api/memberships error:', error)
    return NextResponse.json({ success: false, error: 'Lỗi máy chủ' }, { status: 500 })
  }
}
