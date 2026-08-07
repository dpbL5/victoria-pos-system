import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, requireMutationAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getShiftTransactions, getShiftRevenueData } from '@/lib/shifts'
import { logActivity } from '@/lib/audit'
import { adjustCashDifferenceSchema } from '@/lib/shifts'
import type { ShiftReportDetail } from '@/types'

type PaymentMethodKey = 'CASH' | 'TRANSFER' | 'CARD' | 'MEMBER'
type ItemTypeKey = 'PLAY_TIME' | 'MEMBERSHIP_FEE' | 'PRODUCT' | 'SERVICE' | 'DISCOUNT' | 'SURCHARGE'

const paymentMethods: PaymentMethodKey[] = ['CASH', 'TRANSFER', 'CARD', 'MEMBER']
const itemTypes: ItemTypeKey[] = ['PLAY_TIME', 'MEMBERSHIP_FEE', 'PRODUCT', 'SERVICE', 'DISCOUNT', 'SURCHARGE']

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin()
    const { id } = await params

    const shift = await prisma.shift.findUnique({
      where: { id },
      include: {
        staff: { select: { id: true, fullName: true } },
        participants: {
          include: { staff: { select: { id: true, fullName: true } } },
          orderBy: { joinedAt: 'asc' },
        },
        toolCounts: {
          include: { tool: { select: { id: true, name: true, quantity: true, isRequired: true } } },
          orderBy: { createdAt: 'asc' },
        },
        _count: { select: { sessions: true } },
      },
    })

    if (!shift) {
      return NextResponse.json({ success: false, error: 'Không tìm thấy ca làm' }, { status: 404 })
    }

    const [revenue, txResult, itemTypeRows] = await Promise.all([
      getShiftRevenueData(prisma, id),
      getShiftTransactions(prisma, id),
      prisma.invoiceItem.groupBy({
        by: ['type'],
        where: { invoice: { shiftId: id, status: { not: 'CANCELLED' } } },
        _sum: { total: true },
      }),
    ])

    const byPaymentMethod = Object.fromEntries(
      paymentMethods.map((m) => [m, { total: 0, count: 0 }])
    ) as Record<PaymentMethodKey, { total: number; count: number }>

    for (const tx of txResult.transactions) {
      if (tx.invoiceStatus === 'CANCELLED') continue
      const method = tx.paymentMethod as PaymentMethodKey
      if (byPaymentMethod[method]) {
        byPaymentMethod[method].total += tx.amount
        byPaymentMethod[method].count++
      }
    }

    const byItemType = Object.fromEntries(
      itemTypes.map((t) => [t, 0])
    ) as Record<ItemTypeKey, number>

    for (const row of itemTypeRows) {
      byItemType[row.type as ItemTypeKey] = Number(row._sum?.total ?? 0)
    }

    const detail: ShiftReportDetail = {
      id: shift.id,
      openedAt: shift.openedAt.toISOString(),
      closedAt: shift.closedAt?.toISOString() ?? null,
      openingCash: Number(shift.openingCash),
      closingCash: shift.closingCash != null ? Number(shift.closingCash) : null,
      expectedCash: shift.expectedCash != null ? Number(shift.expectedCash) : null,
      cashDifference: shift.cashDifference != null ? Number(shift.cashDifference) : null,
      status: shift.status,
      notes: shift.notes,
      staff: { id: shift.staff.id, fullName: shift.staff.fullName },
      totalRevenue: revenue.totalRevenue,
      cashRevenue: revenue.cashRevenue,
      transferRevenue: revenue.transferRevenue,
      cardRevenue: revenue.cardRevenue,
      memberRevenue: revenue.memberRevenue,
      paymentCount: revenue.paymentCount,
      membershipCount: revenue.membershipCount,
      sessionCount: shift._count.sessions,
      participants: shift.participants.map((p) => ({
        id: p.id,
        role: p.role,
        joinedAt: p.joinedAt.toISOString(),
        leftAt: p.leftAt?.toISOString() ?? null,
        staff: { id: p.staff.id, fullName: p.staff.fullName },
      })),
      byPaymentMethod,
      byItemType,
      transactions: txResult.transactions,
      toolCounts: shift.toolCounts.map((tc) => ({
        id: tc.id,
        toolId: tc.toolId,
        tool: tc.tool,
        openCount: tc.openCount,
        closeCount: tc.closeCount,
      })),
    }

    return NextResponse.json({ success: true, data: detail })
  } catch (error) {
    if ((error as Error).message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 })
    }
    if ((error as Error).message === 'FORBIDDEN') {
      return NextResponse.json({ success: false, error: 'Chỉ quản trị viên được truy cập' }, { status: 403 })
    }
    console.error('GET /api/reports/shifts/[id] error:', error)
    return NextResponse.json({ success: false, error: 'Lỗi máy chủ' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireMutationAuth(request)
    if (auth.role !== 'ADMIN') {
      return NextResponse.json({ success: false, error: 'Chỉ quản trị viên được điều chỉnh' }, { status: 403 })
    }

    const { id } = await params
    const body = await request.json()
    const parsed = adjustCashDifferenceSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0].message },
        { status: 400 }
      )
    }

    const shift = await prisma.shift.findUnique({ where: { id } })

    if (!shift) {
      return NextResponse.json({ success: false, error: 'Không tìm thấy ca làm' }, { status: 404 })
    }

    if (shift.status !== 'CLOSED') {
      return NextResponse.json(
        { success: false, error: 'Chỉ điều chỉnh được ca đã đóng' },
        { status: 400 }
      )
    }

    await prisma.$transaction(async (tx) => {
      await tx.shift.update({
        where: { id },
        data: {
          cashDifference: parsed.data.cashDifference,
          ...(parsed.data.notes !== undefined ? { notes: parsed.data.notes } : {}),
        },
      })

      await logActivity(tx, {
        userId: auth.userId,
        action: 'SHIFT_CASH_ADJUST',
        entityType: 'Shift',
        entityId: id,
        details: {
          previousDifference: Number(shift.cashDifference ?? 0),
          newDifference: parsed.data.cashDifference,
          notes: parsed.data.notes ?? null,
        },
      })
    })

    const updated = await prisma.shift.findUnique({
      where: { id },
      select: {
        id: true,
        cashDifference: true,
        notes: true,
        updatedAt: true,
      },
    })

    return NextResponse.json({ success: true, data: updated })
  } catch (error) {
    const message = (error as Error).message
    if (message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 })
    }
    if (message === 'CSRF_MISMATCH') {
      return NextResponse.json({ success: false, error: 'Yêu cầu không hợp lệ (CSRF)' }, { status: 403 })
    }
    console.error('PATCH /api/reports/shifts/[id] error:', error)
    return NextResponse.json({ success: false, error: 'Lỗi máy chủ' }, { status: 500 })
  }
}
