import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'
import { findActiveMembership } from '@/lib/memberships'

export async function GET(request: NextRequest) {
  try {
    await requireAuth()

    const { searchParams } = new URL(request.url)
    const customerId = searchParams.get('customerId')
    const where = customerId ? { customerId } : {}

    const [memberships, activeMembership] = await Promise.all([
      prisma.membership.findMany({
        where,
        include: {
          customer: { select: { id: true, fullName: true, phone: true, type: true } },
          plan: true,
        },
        orderBy: { startsAt: 'desc' },
      }),
      customerId ? findActiveMembership(prisma, customerId) : Promise.resolve(null),
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
