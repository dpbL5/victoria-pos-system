// ── Ports — repository interface cho domain reports (read-side) ─────
import type { Prisma } from '@/generated/prisma/client'
import type { ShiftRevenueData } from '@/lib/shifts'

/** Store tối thiểu mà reporting adapter cần — structural pick từ Prisma client */
export type ReportingStore = Pick<
  Prisma.TransactionClient,
  'payment' | 'invoiceItem' | 'session' | 'customer' | 'shift' | 'invoice' | 'product'
>

export type DashboardScope = 'STAFF' | 'ALL'

export interface DashboardInput {
  /** Cửa sổ thời gian (today) */
  start: Date
  end: Date
  /** STAFF → chỉ tính riêng nhân viên; ALL → toàn hệ thống */
  scope: DashboardScope
  staffId: string
  /** Shift hiện tại (nếu có) — để tính revenue theo ca */
  currentShiftId: string | null
}

export interface PaymentMethodRow {
  paymentMethod: string | null
  _sum: { grandTotal: unknown } | null
  _count: { _all: number } | null
}

export interface ItemTypeRow {
  type: string | null
  _sum: { total: unknown } | null
}

export interface DashboardData {
  today: {
    revenue: number
    paymentCount: number
    invoiceCount: number
    sessionsCreated: number
    completedSessions: number
    activeSessions: number
    newCustomers: number
    byPaymentMethod: PaymentMethodRow[]
    byItemType: ItemTypeRow[]
  }
  shift: null | {
    revenue: number
    paymentCount: number
    activeSessions: number
    completedSessions: number
    byPaymentMethod: PaymentMethodRow[]
    byItemType: ItemTypeRow[]
  }
}

export interface RevenueRow {
  id: string
  paidAt: Date
  grandTotal: unknown
  paymentMethod: string | null
  totalHours: unknown
  subtotal: unknown
  discountTotal: unknown
  staff: { fullName: string } | null
  invoice: { id: string; invoiceNo: string; customer: { fullName: string } | null } | null
  session: { customerName: string | null; customer: { fullName: string } | null } | null
}

export interface RevenueInput {
  from: Date
  to: Date
  /** STAFF → chỉ tính riêng nhân viên; ALL → toàn hệ thống */
  scope: DashboardScope
  staffId: string
}

export interface RevenueResult {
  rows: RevenueRow[]
  /** Doanh thu gộp theo ngày (gộp chuỗi ngày VN trong JS — groupBy theo paidAt không gộp được theo ngày) */
  grouped: Array<{ period: string; revenue: number; count: number }>
  recentPayments: RevenueRow[]
}

export interface TrendItemType {
  PLAY_TIME: number
  MEMBERSHIP_FEE: number
  PRODUCT: number
  SERVICE: number
  DISCOUNT: number
  SURCHARGE: number
}

export interface TrendHourRow {
  hour: number
  revenue: number
  count: number
}

export interface TrendDayRow {
  date: string
  sessions: number
  players: number
  revenue: number
}

export interface TrendComparison {
  previousRevenue: number
  currentRevenue: number
  previousSessions: number
  currentSessions: number
}

export interface TrendTotals {
  revenue: number
  sessions: number
  players: number
  avgHours: number
  revenuePerSession: number
  /** Doanh thu trung bình / người chơi trong kỳ — 0 khi players = 0 */
  revenuePerPlayer: number
}

export interface TrendData {
  byItemType: TrendItemType
  byPaymentMethod: PaymentMethodRow[]
  byHour: TrendHourRow[]
  byDay: TrendDayRow[]
  comparison: TrendComparison
  totals: TrendTotals
}

export interface TopProductsInput {
  from: Date
  to: Date
  scope: DashboardScope
  staffId: string
}

export interface TopProductRow {
  productId: string
  name: string
  sku: string | null
  quantitySold: number
  revenue: number
  /** Giá vốn đơn vị hiện hành (Product.costPrice) */
  unitCost: number | null
  /** Lợi nhuận = doanh thu − (giá vốn snapshot × SL bán) */
  profit: number
}

export interface TopProductsResult {
  items: TopProductRow[]
}

export interface SessionExportRow {
  id: string
  createdAt: Date
  status: string
  startTime: Date
  endTime: Date | null
  totalHours: unknown
  totalAmount: unknown
  customerName: string | null
  customer: { fullName: string; type: string } | null
  staff: { fullName: string } | null
}

export interface ShiftDayGroupInput {
  from: Date
  to: Date
  status?: 'OPEN' | 'CLOSED'
  scope: DashboardScope
  staffId: string
}

export interface ShiftDayShift {
  id: string
  staffId: string
  staff: { id: string; fullName: string }
  openedAt: Date
  closedAt: Date | null
  openingCash: unknown
  closingCash: unknown
  expectedCash: unknown
  cashDifference: unknown
  status: string
  _count: { sessions: number; payments: number }
  toolCounts: Array<{ openCount: number; closeCount: number | null }>
  revenue: ShiftRevenueData
}

export interface ShiftDayGroup {
  date: string
  totalRevenue: number
  cashRevenue: number
  transferRevenue: number
  cardRevenue: number
  memberRevenue: number
  paymentCount: number
  membershipCount: number
  sessionCount: number
  weekday: number
  shifts: ShiftDayShift[]
}

export interface ReportingRepository {
  /** Dashboard today + shift stats — đóng gói toàn bộ query đọc dashboard */
  getDashboardData(input: DashboardInput): Promise<DashboardData>
  /** Doanh thu theo ngày (từ payments) + 5 giao dịch gần nhất — GET /api/reports/revenue */
  getRevenueData(input: RevenueInput): Promise<RevenueResult>
  /** Payment rows cho CSV export revenue — GET /api/reports/export?type=revenue */
  getRevenueExportRows(from: Date, to: Date): Promise<RevenueRow[]>
  /** Session rows cho CSV export sessions — GET /api/reports/export?type=sessions */
  getSessionExportRows(from: Date, to: Date): Promise<SessionExportRow[]>
  /** Nhóm shifts theo ngày + revenue từng shift — GET /api/shifts?groupBy=day */
  getShiftDayGroups(input: ShiftDayGroupInput): Promise<ShiftDayGroup[]>
  /** Revenue tổng hợp của 1 shift (payments, STI kind phân loại) — cho per-shift list */
  getShiftRevenue(shiftId: string): Promise<ShiftRevenueData>
  /** Revenue tổng hợp của nhiều shift cùng lúc — thay thế N+1 `getShiftRevenue` loop bằng 2 groupBy */
  getShiftRevenues(shiftIds: string[]): Promise<Map<string, ShiftRevenueData>>
  /** Dữ liệu phân tích (trends) cho màn Báo cáo: nguồn, khung giờ, lưu lượng, so sánh kỳ trước */
  getTrends(input: RevenueInput): Promise<TrendData>
  /** Top sản phẩm bán chạy trong kỳ (InvoiceItem type=PRODUCT, invoice PAID) */
  getTopProducts(input: TopProductsInput): Promise<TopProductsResult>
}
