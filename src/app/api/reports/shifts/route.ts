import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { getShiftRevenueData } from '@/lib/business/shifts'
import { prisma } from '@/lib/prisma'
import { parseStartOfDay, toInputDate } from '@/lib/utils'
import type { ShiftRevenueSummary } from '@/types'

export async function GET(request: NextRequest) {
  try {
    await requireAdmin()

    const { searchParams } = new URL(request.url)
    const fromStr = searchParams.get('from') ?? toInputDate(new Date())
    const toStr = searchParams.get('to') ?? toInputDate(new Date())
    const statusParam = searchParams.get('status')
    const status = statusParam === 'OPEN' || statusParam === 'CLOSED' ? (statusParam as 'OPEN' | 'CLOSED') : undefined
    const page = Math.max(1, Number(searchParams.get('page') ?? 1))
    const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit') ?? 20)))

    const fromDate = parseStartOfDay(fromStr)
    const toDate = new Date(parseStartOfDay(toStr).getTime() + 24 * 60 * 60 * 1000)

    const where: Record<string, unknown> = {
      openedAt: { gte: fromDate, lt: toDate },
    }
    if (status) where.status = status

    const [shifts, total] = await Promise.all([
      prisma.shift.findMany({
        where,
        include: {
          staff: { select: { id: true, fullName: true } },
          _count: { select: { sessions: true } },
          toolCounts: {
            include: { tool: { select: { id: true, name: true, quantity: true, isRequired: true } } },
          },
        },
        orderBy: { openedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.shift.count({ where }),
    ])

    const shiftIds = shifts.map((s) => s.id)

    const revenueMap = new Map<string, Awaited<ReturnType<typeof getShiftRevenueData>>>()
    await Promise.all(
      shiftIds.map(async (id) => {
        revenueMap.set(id, await getShiftRevenueData(prisma as any, id))
      })
    )

    function calcToolStats(tcs: { openCount: number; closeCount: number | null }[]) {
      if (tcs.length === 0) return undefined
      let matched = 0
      let mismatched = 0
      for (const tc of tcs) {
        if (tc.closeCount == null) continue
        if (tc.closeCount === tc.openCount) matched++
        else mismatched++
      }
      return { total: tcs.length, matched, mismatched }
    }

    const data: ShiftRevenueSummary[] = shifts.map((shift) => {
      const rev = revenueMap.get(shift.id) ?? {
        totalRevenue: 0,
        cashRevenue: 0,
        transferRevenue: 0,
        cardRevenue: 0,
        memberRevenue: 0,
        paymentCount: 0,
        membershipCount: 0,
      }

      return {
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
        totalRevenue: rev.totalRevenue,
        cashRevenue: rev.cashRevenue,
        transferRevenue: rev.transferRevenue,
        cardRevenue: rev.cardRevenue,
        memberRevenue: rev.memberRevenue,
        paymentCount: rev.paymentCount,
        membershipCount: rev.membershipCount,
        sessionCount: shift._count.sessions,
        toolStats: calcToolStats(shift.toolCounts),
        toolCounts: shift.toolCounts.map((tc) => ({
          id: tc.id,
          toolId: tc.toolId,
          tool: tc.tool,
          openCount: tc.openCount,
          closeCount: tc.closeCount,
        })),
      }
    })

    return NextResponse.json({
      success: true,
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    if ((error as Error).message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 })
    }
    if ((error as Error).message === 'FORBIDDEN') {
      return NextResponse.json({ success: false, error: 'Chỉ quản trị viên được truy cập' }, { status: 403 })
    }
    console.error('GET /api/reports/shifts error:', error)
    return NextResponse.json({ success: false, error: 'Lỗi máy chủ' }, { status: 500 })
  }
}
