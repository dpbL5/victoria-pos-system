// ── Ports — repository interface cho domain reports (read-side) ─────
import type { Prisma } from '@/generated/prisma/client'
import type { ShiftRevenueData } from '@/lib/shifts'

/** Store tối thiểu mà reporting adapter cần — structural pick từ Prisma client */
export type ReportingStore = Pick<
  Prisma.TransactionClient,
  'payment' | 'invoiceItem' | 'session' | 'customer'
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
  recentPayments: RevenueRow[]
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
  _count: { sessions: number; payments: number; membershipPayments: number }
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
  /** Revenue tổng hợp của 1 shift (payment + membershipPayment) — cho per-shift list */
  getShiftRevenue(shiftId: string): Promise<ShiftRevenueData>
}
