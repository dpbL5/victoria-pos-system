import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/shared/auth'
import { getShiftTransactions } from '@/lib/shifts'
import { repositories } from '@/lib/infrastructure/repositories'
import { prisma } from '@/lib/infrastructure/prisma'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth()
    const { id } = await params

    const shift = await repositories.shift.findByIdAccess(id)

    if (!shift) {
      return NextResponse.json(
        { success: false, error: 'Không tìm thấy ca làm' },
        { status: 404 }
      )
    }

    const isParticipant =
      shift.staffId === auth.userId ||
      shift.participants.some((p) => p.staffId === auth.userId)

    if (auth.role !== 'ADMIN' && auth.role !== 'MANAGER' && !isParticipant) {
      return NextResponse.json(
        { success: false, error: 'Không có quyền xem giao dịch của ca này' },
        { status: 403 }
      )
    }

    const result = await getShiftTransactions(prisma, id)

    return NextResponse.json({
      success: true,
      data: {
        shiftId: shift.id,
        shiftStatus: shift.status,
        transactions: result.transactions,
        summary: result.summary,
      },
    })
  } catch (error) {
    if ((error as Error).message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 })
    }
    console.error('GET /api/shifts/[id]/transactions error:', error)
    return NextResponse.json({ success: false, error: 'Lỗi máy chủ' }, { status: 500 })
  }
}
