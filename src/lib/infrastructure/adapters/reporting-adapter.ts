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

// Store types đã có đủ delegates trong ReportingStore — không cần cast
function payment(store: ReportingStore) {
  return store.payment
}
function invoiceItem(store: ReportingStore) {
  return store.invoiceItem
}
function session(store: ReportingStore) {
  return store.session
}
function customer(store: ReportingStore) {
  return store.customer
}
function membershipPayment(store: ReportingStore) {
  return store.membershipPayment
}
function shift(store: ReportingStore) {
  return store.shift
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
  const [groupedRows, recentPayments] = await Promise.all([
    // Gộp doanh thu theo ngày bằng SQL — thay vì tải hết rows rồi gộp trong JS
    payment(store).groupBy({
      by: ['paidAt'],
      where,
      _sum: { grandTotal: true },
      _count: { _all: true },
    }),
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
          select: {
            customerName: true,
            customer: { select: { fullName: true } },
          },
        },
        staff: { select: { fullName: true } },
      },
      orderBy: { paidAt: 'desc' },
      take: 5,
    }),
  ])

  const grouped = groupedRows
    .map((row) => ({
      period: toInputDate(row.paidAt),
      revenue: Number(row._sum?.grandTotal ?? 0),
      count: row._count?._all ?? 0,
    }))
    .sort((a, b) => (a.period < b.period ? -1 : a.period > b.period ? 1 : 0))

  return {
    rows: groupedRows as unknown as RevenueRow[],
    grouped,
    recentPayments: recentPayments as unknown as RevenueRow[],
  }
}

async function getRevenueExportRows(store: ReportingStore, from: Date, to: Date): Promise<RevenueRow[]> {
  const rows = await payment(store).findMany({
    where: { paidAt: { gte: from, lte: to }, invoice: { status: { not: 'CANCELLED' as const } } },
    include: {
      session: {
        select: {
          customerName: true,
          customer: { select: { fullName: true } },
        },
      },
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
    select: {
      id: true,
      createdAt: true,
      status: true,
      startTime: true,
      endTime: true,
      totalHours: true,
      totalAmount: true,
      customerName: true,
      customer: { select: { fullName: true, type: true } },
      staff: { select: { fullName: true } },
    },
    orderBy: { createdAt: 'asc' },
  })
  return rows as unknown as SessionExportRow[]
}

/**
 * Tổng hợp doanh thu của nhiều shift bằng 2 groupBy (payment + membershipPayment).
 * Thay thế N+1 loop `getShiftRevenueData` từng shift.
 */
async function aggregateShiftRevenueByShiftIds(
  store: ReportingStore,
  shiftIds: string[]
): Promise<Map<string, ShiftRevenueData>> {
  const result = new Map<string, ShiftRevenueData>()
  if (shiftIds.length === 0) return result

  const [paymentRows, mpRows] = await Promise.all([
    payment(store).groupBy({
      by: ['shiftId', 'paymentMethod'],
      where: { shiftId: { in: shiftIds }, invoice: { status: { not: 'CANCELLED' as const } } },
      _sum: { grandTotal: true },
      _count: { _all: true },
    }),
    membershipPayment(store).groupBy({
      by: ['shiftId', 'paymentMethod'],
      where: { shiftId: { in: shiftIds } },
      _sum: { amount: true },
      _count: { _all: true },
    }),
  ])

  // Init từng shift với giá trị rỗng — đảm bảo shift không có payment vẫn xuất hiện
  for (const id of shiftIds) {
    result.set(id, {
      totalRevenue: 0,
      cashRevenue: 0,
      transferRevenue: 0,
      cardRevenue: 0,
      memberRevenue: 0,
      paymentCount: 0,
      membershipCount: 0,
    })
  }

  for (const row of paymentRows) {
    if (!row.shiftId) continue
    const entry = result.get(row.shiftId)!
    const amount = Number(row._sum?.grandTotal ?? 0)
    if (row.paymentMethod === 'CASH') entry.cashRevenue += amount
    else if (row.paymentMethod === 'TRANSFER') entry.transferRevenue += amount
    else if (row.paymentMethod === 'CARD') entry.cardRevenue += amount
    else if (row.paymentMethod === 'MEMBER') entry.memberRevenue += amount
    entry.paymentCount += row._count?._all ?? 0
    entry.totalRevenue += amount
  }

  for (const row of mpRows) {
    if (!row.shiftId) continue
    const entry = result.get(row.shiftId)!
    const amount = Number(row._sum?.amount ?? 0)
    if (row.paymentMethod === 'CASH') entry.cashRevenue += amount
    else if (row.paymentMethod === 'TRANSFER') entry.transferRevenue += amount
    else if (row.paymentMethod === 'CARD') entry.cardRevenue += amount
    else if (row.paymentMethod === 'MEMBER') entry.memberRevenue += amount
    entry.membershipCount += row._count?._all ?? 0
    entry.totalRevenue += amount
  }

  return result
}

async function getShiftDayGroups(store: ReportingStore, input: ShiftDayGroupInput): Promise<ShiftDayGroup[]> {
  const shifts = await shift(store).findMany({
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

  const revenueByShiftId = await aggregateShiftRevenueByShiftIds(
    store,
    shifts.map((s) => s.id)
  )

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
    const revenue = revenueByShiftId.get(shift.id) ?? {
      totalRevenue: 0,
      cashRevenue: 0,
      transferRevenue: 0,
      cardRevenue: 0,
      memberRevenue: 0,
      paymentCount: 0,
      membershipCount: 0,
    }

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
  return getShiftRevenueData({ payment: payment(store), membershipPayment: membershipPayment(store) }, shiftId)
}

async function getShiftRevenues(store: ReportingStore, shiftIds: string[]): Promise<Map<string, ShiftRevenueData>> {
  return aggregateShiftRevenueByShiftIds(store, shiftIds)
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
    getShiftRevenues: (shiftIds) => getShiftRevenues(store, shiftIds),
  }
}
