import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireMutationAuth } from '@/lib/auth'
import { openShiftSchema } from '@/lib/validations/shift'
import {
  findOpenShiftForStaff,
  findOpenOperationalShift,
  shiftWithParticipantsInclude,
  shiftWithAllParticipantsInclude,
  getShiftRevenueData,
} from '@/lib/business/shifts'
import { openOrJoinShift, mapOpenOrJoinShiftError } from '@/lib/business/use-cases/openOrJoinShift'
import { parseStartOfDay, toInputDate } from '@/lib/utils'
import { Prisma } from '@/generated/prisma/client'

const stripeShiftInclude = {
  staff: { select: { id: true, fullName: true } },
  _count: { select: { sessions: true, payments: true, membershipPayments: true } },
  toolCounts: {
    include: { tool: { select: { id: true, name: true, quantity: true, isRequired: true } } },
  },
} satisfies Prisma.ShiftInclude

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth()

    const { searchParams } = new URL(request.url)
    const current = searchParams.get('current') === 'true'
    const openOperational = searchParams.get('openOperational') === 'true'
    const includeParticipants = searchParams.get('includeParticipants')
    const groupByDay = searchParams.get('groupBy') === 'day'
    const takeParam = Number(searchParams.get('limit') ?? 50)
    const take = Number.isInteger(takeParam) && takeParam > 0
      ? Math.min(takeParam, 100)
      : 50
    const statusParam = searchParams.get('status')
    const status =
      statusParam === 'OPEN' || statusParam === 'CLOSED'
        ? statusParam
        : undefined

    if (current) {
      let shift = await findOpenShiftForStaff(prisma, auth.userId)
      if (!shift && auth.role === 'ADMIN') {
        shift = await findOpenOperationalShift(prisma)
      }
      return NextResponse.json({ success: true, data: shift })
    }

    if (openOperational) {
      const shift = await findOpenOperationalShift(prisma)
      return NextResponse.json({ success: true, data: shift })
    }

    if (groupByDay) {
      const fromStr = searchParams.get('from') ?? toInputDate(new Date(Date.now() - 90 * 24 * 60 * 60 * 1000))
      const toStr = searchParams.get('to') ?? toInputDate(new Date())
      const page = Math.max(1, Number(searchParams.get('page') ?? 1))
      const daysPerPage = Math.min(30, Math.max(1, Number(searchParams.get('daysPerPage') ?? 7)))

      const fromDate = parseStartOfDay(fromStr)
      const toDate = new Date(parseStartOfDay(toStr).getTime() + 24 * 60 * 60 * 1000)

      const where: Record<string, unknown> = {
        openedAt: { gte: fromDate, lt: toDate },
        ...(auth.role === 'STAFF'
          ? {
              OR: [
                { staffId: auth.userId },
                { participants: { some: { staffId: auth.userId } } },
              ],
            }
          : {}),
        ...(status ? { status } : {}),
      }

      const shifts = await prisma.shift.findMany({
        where,
        include: stripeShiftInclude,
        orderBy: { openedAt: 'desc' },
      })

      const revenueMap = new Map<string, Awaited<ReturnType<typeof getShiftRevenueData>>>()
      await Promise.all(
        shifts.map(async (s) => {
          revenueMap.set(s.id, await getShiftRevenueData(prisma as any, s.id))
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

      const todayStr = toInputDate(new Date())
      const groups = new Map<string, {
        date: string
        totalRevenue: number
        cashRevenue: number
        transferRevenue: number
        cardRevenue: number
        memberRevenue: number
        paymentCount: number
        membershipCount: number
        sessionCount: number
        shifts: Array<Record<string, unknown>>
      }>()

      for (const shift of shifts) {
        const dayKey = toInputDate(shift.openedAt)
        if (!groups.has(dayKey)) {
          groups.set(dayKey, {
            date: dayKey,
            totalRevenue: 0,
            cashRevenue: 0,
            transferRevenue: 0,
            cardRevenue: 0,
            memberRevenue: 0,
            paymentCount: 0,
            membershipCount: 0,
            sessionCount: 0,
            shifts: [],
          })
        }
        const group = groups.get(dayKey)!
        const rev = revenueMap.get(shift.id) ?? { totalRevenue: 0, cashRevenue: 0, transferRevenue: 0, cardRevenue: 0, memberRevenue: 0, paymentCount: 0, membershipCount: 0 }

        group.totalRevenue += rev.totalRevenue
        group.cashRevenue += rev.cashRevenue
        group.transferRevenue += rev.transferRevenue
        group.cardRevenue += rev.cardRevenue
        group.memberRevenue += rev.memberRevenue
        group.paymentCount += rev.paymentCount
        group.membershipCount += rev.membershipCount
        group.sessionCount += shift._count.sessions

        group.shifts.push({
          id: shift.id,
          staffId: shift.staffId,
          staff: shift.staff,
          openedAt: shift.openedAt.toISOString(),
          closedAt: shift.closedAt?.toISOString() ?? null,
          openingCash: Number(shift.openingCash),
          closingCash: shift.closingCash != null ? Number(shift.closingCash) : null,
          expectedCash: shift.expectedCash != null ? Number(shift.expectedCash) : null,
          cashDifference: shift.cashDifference != null ? Number(shift.cashDifference) : null,
          status: shift.status,
          _count: shift._count,
          toolCounts: shift.toolCounts,
          toolStats: calcToolStats(shift.toolCounts as any),
        })
      }

      let sortedDays = Array.from(groups.values())
      sortedDays.sort((a, b) => b.date.localeCompare(a.date))

      if (sortedDays.some((g) => g.date === todayStr)) {
        sortedDays = [
          ...sortedDays.filter((g) => g.date === todayStr),
          ...sortedDays.filter((g) => g.date !== todayStr),
        ]
      }

      const totalDays = sortedDays.length
      const startIdx = (page - 1) * daysPerPage
      const paged = sortedDays.slice(startIdx, startIdx + daysPerPage)

      return NextResponse.json({
        success: true,
        data: paged,
        pagination: {
          page,
          daysPerPage,
          totalDays,
          totalPages: Math.ceil(totalDays / daysPerPage),
        },
      })
    }

    const shifts = await prisma.shift.findMany({
      where: {
        ...(auth.role === 'STAFF'
          ? {
              OR: [
                { staffId: auth.userId },
                { participants: { some: { staffId: auth.userId } } },
              ],
            }
          : {}),
        ...(status ? { status } : {}),
      },
      include: includeParticipants === 'all'
        ? shiftWithAllParticipantsInclude
        : shiftWithParticipantsInclude,
      orderBy: { openedAt: 'desc' },
      take,
    })

    return NextResponse.json({ success: true, data: shifts })
  } catch (error) {
    if ((error as Error).message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 })
    }
    console.error('GET /api/shifts error:', error)
    return NextResponse.json({ success: false, error: 'Lỗi máy chủ' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireMutationAuth(request)

    const body = await request.json()
    const parsed = openShiftSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0].message },
        { status: 400 }
      )
    }

    const result = await openOrJoinShift({
      staffId: auth.userId,
      openingCash: parsed.data.openingCash,
      notes: parsed.data.notes,
      toolCounts: parsed.data.toolCounts,
    })

    return NextResponse.json(
      {
        success: true,
        data: result.shift,
        message: result.created
          ? 'Đã mở ca'
          : result.joined
            ? 'Đã tham gia ca đang mở'
            : 'Bạn đang ở trong ca đang mở',
      },
      { status: result.created ? 201 : 200 }
    )
  } catch (error) {
    const message = (error as Error).message
    if (message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 })
    }
    if (message === 'CSRF_MISMATCH') {
      return NextResponse.json({ success: false, error: 'Yêu cầu không hợp lệ (CSRF)' }, { status: 403 })
    }
    console.error('POST /api/shifts error:', error)
    const mapped = mapOpenOrJoinShiftError(error as Error)
    return NextResponse.json(
      { success: false, code: mapped.code, error: mapped.message },
      { status: mapped.status }
    )
  }
}
