// ── Reporting adapter — read-side queries cho báo cáo ─────
import type { Prisma } from '@/generated/prisma/client'
import { getShiftRevenueData, type ShiftRevenueData } from '@/lib/shifts'
import { toInputDate } from '@/lib/shared/utils'
import type {
  DashboardData,
  DashboardInput,
  DashboardScope,
  ItemTypeRow,
  PaymentMethodRow,
  ReportingRepository,
  ReportingStore,
  RevenueInput,
  RevenueResult,
  RevenueRow,
  SessionExportRow,
  ShiftDayGroup,
  ShiftDayGroupInput,
} from '@/lib/reports/ports'

/** Cast store về delegate cụ thể — khu trú việc `as never` chỉ ở adapter */
function payment(store: ReportingStore) {
  return (store as unknown as { payment: Prisma.PaymentDelegate }).payment
}
function invoiceItem(store: ReportingStore) {
  return (store as unknown as { invoiceItem: Prisma.InvoiceItemDelegate }).invoiceItem
}
function session(store: ReportingStore) {
  return (store as unknown as { session: Prisma.SessionDelegate }).session
}
function customer(store: ReportingStore) {
  return (store as unknown as { customer: Prisma.CustomerDelegate }).customer
}

function scopeWhere(scope: DashboardScope, staffId: string) {
  return scope === 'STAFF' ? { staffId } : {}
}

function buildPaymentWhere(input: DashboardInput) {
  return {
    paidAt: { gte: input.start, lt: input.end },
    invoice: { status: { not: 'CANCELLED' as const } },
    ...scopeWhere(input.scope, input.staffId),
  }
}

function buildInvoiceWhere(input: DashboardInput) {
  return {
    paidAt: { gte: input.start, lt: input.end },
    status: { not: 'CANCELLED' as const },
    ...scopeWhere(input.scope, input.staffId),
  }
}

function buildShiftPaymentWhere(shiftId: string) {
  return { shiftId, invoice: { status: { not: 'CANCELLED' as const } } }
}

async function getDashboardData(store: ReportingStore, input: DashboardInput): Promise<DashboardData> {
  const paymentWhere = buildPaymentWhere(input)
  const invoiceWhere = buildInvoiceWhere(input)
  const sessionWhere = {
    createdAt: { gte: input.start, lt: input.end },
    ...scopeWhere(input.scope, input.staffId),
  }
  const completedWhere = {
    status: 'COMPLETED' as const,
    endTime: { gte: input.start, lt: input.end },
    ...scopeWhere(input.scope, input.staffId),
  }
  const activeWhere = {
    status: 'ACTIVE' as const,
    ...scopeWhere(input.scope, input.staffId),
  }
  const shiftWhere = input.currentShiftId ? buildShiftPaymentWhere(input.currentShiftId) : null

  const [
    todayPayments,
    todayPaymentCount,
    todayInvoices,
    todaySessions,
    completedSessions,
    activeSessions,
    totalCustomersToday,
    todayPaymentMethods,
    todayItemTypes,
    shiftPayments,
    shiftPaymentCount,
    shiftPaymentMethods,
    shiftItemTypes,
    shiftActiveSessions,
    shiftCompletedSessions,
  ] = await Promise.all([
    payment(store).aggregate({ where: paymentWhere, _sum: { grandTotal: true } }),
    payment(store).count({ where: paymentWhere }),
    payment(store).count({ where: invoiceWhere }),
    session(store).count({ where: sessionWhere }),
    session(store).count({ where: completedWhere }),
    session(store).count({ where: activeWhere }),
    customer(store).count({ where: { createdAt: { gte: input.start, lt: input.end } } }),
    payment(store).groupBy({
      by: ['paymentMethod'],
      where: paymentWhere,
      _sum: { grandTotal: true },
      _count: { _all: true },
    }),
    invoiceItem(store).groupBy({
      by: ['type'],
      where: { invoice: invoiceWhere },
      _sum: { total: true },
    }),
    shiftWhere
      ? payment(store).aggregate({ where: shiftWhere, _sum: { grandTotal: true } })
      : Promise.resolve(null),
    shiftWhere
      ? payment(store).count({ where: shiftWhere })
      : Promise.resolve(0),
    shiftWhere
      ? payment(store).groupBy({
          by: ['paymentMethod'],
          where: shiftWhere,
          _sum: { grandTotal: true },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    shiftWhere
      ? invoiceItem(store).groupBy({
          by: ['type'],
          where: { invoice: { shiftId: input.currentShiftId!, status: { not: 'CANCELLED' as const } } },
          _sum: { total: true },
        })
      : Promise.resolve([]),
    input.currentShiftId
      ? session(store).count({ where: { shiftId: input.currentShiftId, status: 'ACTIVE' as const } })
      : Promise.resolve(0),
    input.currentShiftId
      ? session(store).count({ where: { shiftId: input.currentShiftId, status: 'COMPLETED' as const } })
      : Promise.resolve(0),
  ])

  return {
    today: {
      revenue: Number(todayPayments._sum?.grandTotal ?? 0),
      paymentCount: todayPaymentCount,
      invoiceCount: todayInvoices,
      sessionsCreated: todaySessions,
      completedSessions,
      activeSessions,
      newCustomers: totalCustomersToday,
      byPaymentMethod: todayPaymentMethods as unknown as PaymentMethodRow[],
      byItemType: todayItemTypes as unknown as ItemTypeRow[],
    },
    shift: shiftWhere
      ? {
          revenue: Number(shiftPayments?._sum?.grandTotal ?? 0),
          paymentCount: shiftPaymentCount,
          activeSessions: shiftActiveSessions,
          completedSessions: shiftCompletedSessions,
          byPaymentMethod: shiftPaymentMethods as unknown as PaymentMethodRow[],
          byItemType: shiftItemTypes as unknown as ItemTypeRow[],
        }
      : null,
  }
}

async function getRevenueData(store: ReportingStore, input: RevenueInput): Promise<RevenueResult> {
  const where = {
    paidAt: { gte: input.from, lte: input.to },
    invoice: { status: { not: 'CANCELLED' as const } },
    ...scopeWhere(input.scope, input.staffId),
  }
  const [rows, recentPayments] = await Promise.all([
    payment(store).findMany({ where, orderBy: { paidAt: 'asc' } }),
    payment(store).findMany({
      where,
      include: {
        invoice: {
          select: {
            id: true,
            invoiceNo: true,
            customer: { select: { fullName: true } },
          },
        },
        session: {
          select: { customer: { select: { fullName: true } } },
        },
        staff: { select: { fullName: true } },
      },
      orderBy: { paidAt: 'desc' },
      take: 5,
    }),
  ])
  return {
    rows: rows as unknown as RevenueRow[],
    recentPayments: recentPayments as unknown as RevenueRow[],
  }
}

async function getRevenueExportRows(store: ReportingStore, from: Date, to: Date): Promise<RevenueRow[]> {
  const rows = await payment(store).findMany({
    where: { paidAt: { gte: from, lte: to }, invoice: { status: { not: 'CANCELLED' as const } } },
    include: {
      session: { select: { customer: { select: { fullName: true } } } },
      invoice: {
        select: {
          invoiceNo: true,
          customer: { select: { fullName: true } },
        },
      },
      staff: { select: { fullName: true } },
    },
    orderBy: { paidAt: 'asc' },
  })
  return rows as unknown as RevenueRow[]
}

async function getSessionExportRows(store: ReportingStore, from: Date, to: Date): Promise<SessionExportRow[]> {
  const rows = await session(store).findMany({
    where: { createdAt: { gte: from, lte: to } },
    include: {
      customer: { select: { fullName: true, type: true } },
      staff: { select: { fullName: true } },
    },
    orderBy: { createdAt: 'asc' },
  })
  return rows as unknown as SessionExportRow[]
}

async function getShiftDayGroups(store: ReportingStore, input: ShiftDayGroupInput): Promise<ShiftDayGroup[]> {
  const shiftDb = (store as unknown as { shift: Prisma.ShiftDelegate }).shift
  const membershipPaymentDb = (store as unknown as { membershipPayment: Prisma.MembershipPaymentDelegate }).membershipPayment
  const paymentDb = payment(store)

  const shifts = await shiftDb.findMany({
    where: {
      openedAt: { gte: input.from, lt: input.to },
      ...(input.scope === 'STAFF'
        ? {
            OR: [
              { staffId: input.staffId },
              { participants: { some: { staffId: input.staffId } } },
            ],
          }
        : {}),
      ...(input.status ? { status: input.status } : {}),
    },
    include: {
      staff: { select: { id: true, fullName: true } },
      _count: { select: { sessions: true, payments: true, membershipPayments: true } },
      toolCounts: {
        include: { tool: { select: { id: true, name: true, quantity: true, isRequired: true } } },
      },
    },
    orderBy: { openedAt: 'desc' },
  })

  const groups = new Map<string, ShiftDayGroup>()
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
    const revenue = await getShiftRevenueData(
      { payment: paymentDb, membershipPayment: membershipPaymentDb },
      shift.id
    )

    group.totalRevenue += revenue.totalRevenue
    group.cashRevenue += revenue.cashRevenue
    group.transferRevenue += revenue.transferRevenue
    group.cardRevenue += revenue.cardRevenue
    group.memberRevenue += revenue.memberRevenue
    group.paymentCount += revenue.paymentCount
    group.membershipCount += revenue.membershipCount
    group.sessionCount += shift._count.sessions

    group.shifts.push({
      id: shift.id,
      staffId: shift.staffId,
      staff: shift.staff,
      openedAt: shift.openedAt,
      closedAt: shift.closedAt,
      openingCash: shift.openingCash,
      closingCash: shift.closingCash,
      expectedCash: shift.expectedCash,
      cashDifference: shift.cashDifference,
      status: shift.status,
      _count: shift._count,
      toolCounts: shift.toolCounts.map((tc) => ({ openCount: tc.openCount, closeCount: tc.closeCount })),
      revenue,
    })
  }

  return Array.from(groups.values())
}

async function getShiftRevenue(store: ReportingStore, shiftId: string): Promise<ShiftRevenueData> {
  const paymentDb = payment(store)
  const membershipPaymentDb = (store as unknown as { membershipPayment: Prisma.MembershipPaymentDelegate }).membershipPayment
  return getShiftRevenueData({ payment: paymentDb, membershipPayment: membershipPaymentDb }, shiftId)
}

/** Factory — nhận store (prisma hoặc tx) → repository */
export function createReportingRepository(store: ReportingStore): ReportingRepository {
  return {
    getDashboardData: (input) => getDashboardData(store, input),
    getRevenueData: (input) => getRevenueData(store, input),
    getRevenueExportRows: (from, to) => getRevenueExportRows(store, from, to),
    getSessionExportRows: (from, to) => getSessionExportRows(store, from, to),
    getShiftDayGroups: (input) => getShiftDayGroups(store, input),
    getShiftRevenue: (shiftId) => getShiftRevenue(store, shiftId),
  }
}
