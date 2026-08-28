// ── Reporting adapter — read-side queries cho báo cáo ─────
import type { Prisma } from '@/generated/prisma/client'
import { getShiftRevenueData, type ShiftRevenueData } from '@/lib/shifts'
import { toInputDate } from '@/lib/shared/utils'
import { getVnDay } from '@/lib/shared/utils'
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
  TopProductsInput,
  TopProductsResult,
  TrendData,
  TrendDayRow,
  TrendHourRow,
  TrendItemType,
} from '@/lib/reports/ports'

// Store types đã có đủ delegates trong ReportingStore — không cần cast
function payment(store: ReportingStore) {
  return store.payment
}
function invoice(store: ReportingStore) {
  return store.invoice
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
function shift(store: ReportingStore) {
  return store.shift
}
function product(store: ReportingStore) {
  return store.product
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
    invoice(store).count({ where: invoiceWhere }),
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
    // Lấy payments thô rồi gộp theo ngày trong JS — `groupBy` theo `paidAt`
    // (timestamp chính xác) không gộp được theo ngày VN, dễ sinh trùng `period`
    payment(store).findMany({
      where,
      select: { paidAt: true, grandTotal: true },
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

  const dayMap = new Map<string, { revenue: number; count: number }>()
  for (const row of groupedRows) {
    const day = toInputDate(row.paidAt)
    const entry = dayMap.get(day) ?? { revenue: 0, count: 0 }
    entry.revenue += Number(row.grandTotal ?? 0)
    entry.count += 1
    dayMap.set(day, entry)
  }
  const grouped = Array.from(dayMap.entries())
    .map(([period, { revenue, count }]) => ({ period, revenue, count }))
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
    orderBy: { paidAt: 'desc' },
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
 * Tổng hợp doanh thu của nhiều shift bằng 1 groupBy payment (STI: kind phân loại).
 * Thay thế N+1 loop `getShiftRevenueData` từng shift.
 */
async function aggregateShiftRevenueByShiftIds(
  store: ReportingStore,
  shiftIds: string[]
): Promise<Map<string, ShiftRevenueData>> {
  const result = new Map<string, ShiftRevenueData>()
  if (shiftIds.length === 0) return result

  const paymentRows = await payment(store).groupBy({
    by: ['shiftId', 'paymentMethod', 'kind'],
    where: { shiftId: { in: shiftIds }, invoice: { status: { not: 'CANCELLED' as const } } },
    _sum: { grandTotal: true },
    _count: { _all: true },
  })

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
    if (row.kind === 'MEMBERSHIP') entry.membershipCount += row._count?._all ?? 0
    else entry.paymentCount += row._count?._all ?? 0
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
      _count: { select: { sessions: true, payments: true } },
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
        weekday: getVnDay(shift.openedAt),
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
  return getShiftRevenueData({ payment: payment(store) }, shiftId)
}

async function getShiftRevenues(store: ReportingStore, shiftIds: string[]): Promise<Map<string, ShiftRevenueData>> {
  return aggregateShiftRevenueByShiftIds(store, shiftIds)
}

/**
 * Dữ liệu phân tích cho màn Báo cáo:
 * - byItemType: doanh thu theo nguồn gộp cả kỳ (InvoiceItem.total, loại invoice CANCELLED)
 * - byHour: doanh thu theo giờ trong ngày (nhóm Payment.paidAt theo giờ — JS vì volume nhỏ)
 * - byDay: lưu lượng theo ngày (sessions + players) + doanh thu theo ngày
 * - comparison: so sánh kỳ trước (cùng độ dài, ngay trước from)
 * - totals: tổng hợp kỳ hiện tại cho scorecard
 */
async function getTrends(store: ReportingStore, input: RevenueInput): Promise<TrendData> {
  const where = {
    paidAt: { gte: input.from, lte: input.to },
    invoice: { status: { not: 'CANCELLED' as const } },
    ...scopeWhere(input.scope, input.staffId),
  }
  const sessionWhere = {
    status: 'COMPLETED' as const,
    endTime: { gte: input.from, lte: input.to },
    ...scopeWhere(input.scope, input.staffId),
  }
  const itemWhere = {
    invoice: {
      paidAt: { gte: input.from, lte: input.to },
      status: { not: 'CANCELLED' as const },
      ...scopeWhere(input.scope, input.staffId),
    },
  }

  // Kỳ trước: cùng độ dài ngay trước `from` (lte→lt để không chồng ngày)
  const rangeMs = input.to.getTime() - input.from.getTime()
  const prevTo = new Date(input.from.getTime())
  const prevFrom = new Date(prevTo.getTime() - rangeMs)
  const prevWhere = {
    paidAt: { gte: prevFrom, lt: prevTo },
    invoice: { status: { not: 'CANCELLED' as const } },
    ...scopeWhere(input.scope, input.staffId),
  }
  const prevSessionWhere = {
    status: 'COMPLETED' as const,
    endTime: { gte: prevFrom, lt: prevTo },
    ...scopeWhere(input.scope, input.staffId),
  }

  const [itemTypeRows, paymentMethodRows, paymentRows, prevPaymentAgg, sessionRows, prevSessionCount] = await Promise.all([
    invoiceItem(store).groupBy({
      by: ['type'],
      where: itemWhere,
      _sum: { total: true },
    }),
    payment(store).groupBy({
      by: ['paymentMethod'],
      where,
      _sum: { grandTotal: true },
      _count: { _all: true },
    }),
    // Chỉ lấy cột cần — đủ để gộp theo giờ và theo ngày trong JS
    payment(store).findMany({ where, select: { paidAt: true, grandTotal: true } }),
    payment(store).aggregate({ where: prevWhere, _sum: { grandTotal: true } }),
    session(store).findMany({
      where: sessionWhere,
      select: {
        startTime: true,
        endTime: true,
        playerCount: true,
        totalHours: true,
        pricingGroups: { select: { playerCount: true } },
      },
    }),
    session(store).count({ where: prevSessionWhere }),
  ])

  // ── byItemType ──
  const byItemType: TrendItemType = {
    PLAY_TIME: 0,
    MEMBERSHIP_FEE: 0,
    PRODUCT: 0,
    SERVICE: 0,
    DISCOUNT: 0,
    SURCHARGE: 0,
  }
  for (const row of itemTypeRows) {
    const key = row.type as keyof TrendItemType
    if (key in byItemType) byItemType[key] = Number(row._sum?.total ?? 0)
  }

  // ── byHour + byDay (từ payments) ──
  const hourMap = new Map<number, { revenue: number; count: number }>()
  const dayRevenueMap = new Map<string, number>()
  for (const payment of paymentRows) {
    const hour = payment.paidAt.getHours()
    const entry = hourMap.get(hour) ?? { revenue: 0, count: 0 }
    entry.revenue += Number(payment.grandTotal ?? 0)
    entry.count += 1
    hourMap.set(hour, entry)

    const dayKey = toInputDate(payment.paidAt)
    dayRevenueMap.set(dayKey, (dayRevenueMap.get(dayKey) ?? 0) + Number(payment.grandTotal ?? 0))
  }
  const byHour: TrendHourRow[] = Array.from(hourMap.entries())
    .map(([hour, { revenue, count }]) => ({ hour, revenue, count }))
    .sort((a, b) => a.hour - b.hour)

  // ── byDay (chỉ phiên đã hoàn tất: sessions + players, gộp doanh thu theo ngày) ──
  const daySessionMap = new Map<string, { sessions: number; players: number }>()
  let totalPlayers = 0
  let totalHours = 0
  for (const s of sessionRows) {
    const sessionPlayers = s.pricingGroups.reduce((sum, group) => sum + group.playerCount, 0) || s.playerCount
    totalPlayers += sessionPlayers
    totalHours += Number(s.totalHours ?? 0)
    const dayKey = toInputDate(s.endTime ?? s.startTime)
    const entry = daySessionMap.get(dayKey) ?? { sessions: 0, players: 0 }
    entry.sessions += 1
    entry.players += sessionPlayers
    daySessionMap.set(dayKey, entry)
  }
  const byDay: TrendDayRow[] = Array.from(daySessionMap.entries())
    .map(([date, { sessions, players }]) => ({
      date,
      sessions,
      players,
      revenue: dayRevenueMap.get(date) ?? 0,
    }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))

  // ── comparison + totals ──
  const currentRevenue = paymentRows.reduce((sum, p) => sum + Number(p.grandTotal ?? 0), 0)
  const sessions = sessionRows.length
  const previousRevenue = Number(prevPaymentAgg._sum?.grandTotal ?? 0)

  return {
    byItemType,
    byPaymentMethod: paymentMethodRows as unknown as PaymentMethodRow[],
    byHour,
    byDay,
    comparison: {
      previousRevenue,
      currentRevenue,
      previousSessions: prevSessionCount,
      currentSessions: sessions,
    },
    totals: {
      revenue: currentRevenue,
      sessions,
      players: totalPlayers,
      avgHours: sessions > 0 ? Math.round((totalHours / sessions) * 100) / 100 : 0,
      revenuePerSession: sessions > 0 ? Math.round(currentRevenue / sessions) : 0,
      revenuePerPlayer: totalPlayers > 0 ? Math.round(currentRevenue / totalPlayers) : 0,
    },
  }
}

/**
 * Top sản phẩm bán chạy trong kỳ.
 * Nguồn: InvoiceItem type=PRODUCT (có productId), invoice status=PAID, paidAt trong kỳ.
 * Scope STAFF → lọc theo invoice.staffId (InvoiceItem không có staffId trực tiếp).
 * Sản phẩm bị xoá (productId không còn tồn tại) → bỏ qua row orphan.
 * Lợi nhuận = doanh thu − (giá vốn snapshot × SL bán), dùng InvoiceItem.unitCost theo từng dòng
 * (fallback Product.costPrice cho dữ liệu cũ chưa có snapshot).
 */
async function getTopProducts(store: ReportingStore, input: TopProductsInput): Promise<TopProductsResult> {
  const invoiceWhere = {
    paidAt: { gte: input.from, lte: input.to },
    status: 'PAID' as const,
    ...scopeWhere(input.scope, input.staffId),
  }

  // Dùng findMany (không groupBy) để lấy unitCost snapshot từng dòng — profit = Σ(quantity × unitCost)
  const rows = await invoiceItem(store).findMany({
    where: {
      type: 'PRODUCT' as const,
      productId: { not: null },
      invoice: invoiceWhere,
    },
    select: {
      productId: true,
      quantity: true,
      total: true,
      unitCost: true,
    },
  })

  // Gộp trong JS theo productId
  const byProduct = new Map<string, { quantitySold: number; revenue: number }>()
  for (const row of rows) {
    if (!row.productId) continue
    const entry = byProduct.get(row.productId) ?? { quantitySold: 0, revenue: 0 }
    entry.quantitySold += Number(row.quantity ?? 0)
    entry.revenue += Number(row.total ?? 0)
    byProduct.set(row.productId, entry)
  }

  const ranked = Array.from(byProduct.entries())
    .map(([productId, agg]) => ({ productId, ...agg }))
    .sort((a, b) => b.revenue - a.revenue || b.quantitySold - a.quantitySold)
    .slice(0, 20)

  if (ranked.length === 0) return { items: [] }

  const products = await product(store).findMany({
    where: { id: { in: ranked.map((r) => r.productId) } },
    select: { id: true, name: true, sku: true, costPrice: true },
  })
  const productById = new Map(products.map((p) => [p.id, p]))

  const items = ranked
    .filter((row) => productById.has(row.productId)) // omit orphan
    .map((row) => {
      const p = productById.get(row.productId)!
      // Giá vốn: snapshot từng dòng (unitCost), fallback costPrice hiện hành cho dữ liệu cũ
      const unitCost = p.costPrice != null ? Number(p.costPrice) : null
      // Cogs = Σ per row: quantity × (row.unitCost ?? costPrice hiện hành)
      let cogs = 0
      for (const r of rows) {
        if (r.productId !== row.productId) continue
        const qty = Number(r.quantity ?? 0)
        const cost = r.unitCost != null ? Number(r.unitCost) : unitCost
        if (cost != null) cogs += qty * cost
      }
      return {
        productId: row.productId,
        name: p.name,
        sku: p.sku,
        quantitySold: row.quantitySold,
        revenue: row.revenue,
        unitCost,
        profit: row.revenue - cogs,
      }
    })

  return { items }
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
    getTrends: (input) => getTrends(store, input),
    getTopProducts: (input) => getTopProducts(store, input),
  }
}
