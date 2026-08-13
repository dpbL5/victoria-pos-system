import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requireMutationAuth } from '@/lib/shared/auth'
import { openShiftSchema, openOrJoinShift, mapOpenOrJoinShiftError } from '@/lib/shifts'
import {
  findOpenShiftForStaff,
  findOpenOperationalShift,
  shiftWithParticipantsInclude,
  shiftWithAllParticipantsInclude,
} from '@/lib/shifts'
import { apiError, ERR_UNAUTHORIZED, ERR_CSRF } from '@/lib/infrastructure/api-helpers'
import { parseStartOfDay, toInputDate } from '@/lib/shared/utils'
import { Prisma } from '@/generated/prisma/client'
import { repositories } from '@/lib/infrastructure/repositories'

const stripeShiftInclude = {
  staff: { select: { id: true, fullName: true } },
  _count: { select: { sessions: true, payments: true } },
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

    // ── Bootstrap: 1 request lấy cả shift của staff + shift OPEN bất kỳ ──
    // Giảm 2 round-trip → 1 cho màn POS (TodayShiftScreen gọi cả 2).
    if (current && openOperational) {
      const [myShift, openShift] = await Promise.all([
        repositories.shift.findOpenForStaff(auth.userId),
        repositories.shift.findOpenOperational(),
      ])
      return NextResponse.json({
        success: true,
        data: {
          myShift,
          openShift,
        },
      })
    }

    if (current) {
      let shift = await repositories.shift.findOpenForStaff(auth.userId)
      if (!shift && auth.role === 'ADMIN') {
        shift = await repositories.shift.findOpenOperational()
      }
      return NextResponse.json({ success: true, data: shift })
    }

    if (openOperational) {
      const shift = await repositories.shift.findOpenOperational()
      return NextResponse.json({ success: true, data: shift })
    }

    if (groupByDay) {
      const fromStr = searchParams.get('from') ?? toInputDate(new Date(Date.now() - 90 * 24 * 60 * 60 * 1000))
      const toStr = searchParams.get('to') ?? toInputDate(new Date())
      const page = Math.max(1, Number(searchParams.get('page') ?? 1))
      const daysPerPage = Math.min(30, Math.max(1, Number(searchParams.get('daysPerPage') ?? 7)))

      const fromDate = parseStartOfDay(fromStr)
      const toDate = new Date(parseStartOfDay(toStr).getTime() + 24 * 60 * 60 * 1000)

      const groups = await repositories.reporting.getShiftDayGroups({
        from: fromDate,
        to: toDate,
        ...(status ? { status } : {}),
        scope: auth.role === 'STAFF' ? 'STAFF' : 'ALL',
        staffId: auth.userId,
      })

      const todayStr = toInputDate(new Date())
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

    const { rows: shifts } = await repositories.shift.findManyWithCount({
      from: new Date(0),
      to: new Date(),
      ...(auth.role === 'STAFF' ? { staffId: auth.userId } : {}),
      ...(status ? { status } : {}),
      includeParticipants: includeParticipants === 'all' ? 'all' : 'active',
      skip: 0,
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
      return apiError({ code: 'VALIDATION', message: parsed.error.issues[0].message, status: 400 })
    }

    const result = await openOrJoinShift({
      staffId: auth.userId,
      openingCash: parsed.data.openingCash,
      notes: parsed.data.notes,
      toolCounts: parsed.data.toolCounts,
    })
    if (!result.ok) return apiError(mapOpenOrJoinShiftError(result.error))

    return NextResponse.json(
      {
        success: true,
        data: result.value.shift,
        message: result.value.created
          ? 'Đã mở ca'
          : result.value.joined
            ? 'Đã tham gia ca đang mở'
            : 'Bạn đang ở trong ca đang mở',
      },
      { status: result.value.created ? 201 : 200 }
    )
  } catch (error) {
    const message = (error as Error).message
    if (message === 'UNAUTHORIZED') return apiError(ERR_UNAUTHORIZED)
    if (message === 'CSRF_MISMATCH') return apiError(ERR_CSRF)
    console.error('POST /api/shifts error:', error)
    return apiError({ code: 'SERVER_ERROR', message: 'Lỗi máy chủ', status: 500 })
  }
}
