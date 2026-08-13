// ── Ports — repository interface cho domain shifts ─────
import type { Prisma } from '@/generated/prisma/client'
import { shiftWithParticipantsInclude } from './helpers'
import type { ToolCountEntry } from './validations'

export type OpenShiftDetail = Prisma.ShiftGetPayload<{
  include: typeof shiftWithParticipantsInclude
}>

export interface ShiftForClose {
  id: string
  status: string
  staffId: string
  participants: Array<{ staffId: string }>
}

export interface CloseShiftData {
  closedAt: Date
  closingCash: number
  expectedCash: number
  cashDifference: number
  notes?: string
}

export interface ShiftRepository {
  /** Ca mở mà nhân viên đang tham gia (mở bởi staffId hoặc participant chưa rời ca) */
  findOpenForStaff(staffId: string): Promise<OpenShiftDetail | null>
  /** Ca quầy đang mở (bất kỳ nhân viên nào) */
  findOpenOperational(): Promise<OpenShiftDetail | null>
  /** Shift + participants đang hoạt động — dùng cho closeShift check quyền */
  findByIdForClose(shiftId: string): Promise<ShiftForClose | null>
  /** Tiền mặt kỳ vọng = openingCash + tổng payment CASH chưa huỷ */
  calculateExpectedCash(shiftId: string): Promise<number>
  /** Đánh dấu toàn bộ participant còn hoạt động rời ca */
  markParticipantsLeft(shiftId: string, leftAt: Date): Promise<void>
  /** Cập nhật closeCount cho dụng cụ của ca */
  upsertToolCloseCount(shiftId: string, toolId: string, closeCount: number): Promise<void>
  /** Ghi openCount cho dụng cụ của ca (đếm dụng cụ đầu ca) — upsert, giữ closeCount nếu có */
  upsertToolOpenCount(shiftId: string, toolId: string, openCount: number): Promise<void>
  /** Đóng ca — trả về shift CLOSED kèm participants */
  close(shiftId: string, data: CloseShiftData): Promise<OpenShiftDetail>
  /** Thêm/khôi phục participant của ca (join) */
  upsertParticipant(shiftId: string, staffId: string): Promise<void>
  /** findUniqueOrThrow với include participants — throw P2025 nếu không tồn tại */
  findByIdOrThrow(shiftId: string): Promise<OpenShiftDetail>
  /** Cập nhật trực tiếp (dùng cho manage-participant set role LEAD) */
  update(shiftId: string, data: Record<string, unknown>): Promise<void>
  /** Tạo ca mới với participant LEAD + toolCounts */
  createWithLead(data: {
    staffId: string
    openingCash: number
    notes?: string
    toolCounts?: ToolCountEntry[]
  }): Promise<OpenShiftDetail>
  /** Shift + staff + participants + toolCounts + _count — cho shift report detail */
  findByIdWithToolStats(shiftId: string): Promise<ShiftReportRow | null>
  /** Shift tối giản (staffId/status/participants) — cho IDOR check transactions route */
  findByIdAccess(shiftId: string): Promise<{ id: string; staffId: string; status: string; participants: Array<{ staffId: string }> } | null>
  /** Danh sách ca + phân trang (filter openedAt/status/staffScope) — GET /api/shifts */
  findManyWithCount(input: ShiftListFilter): Promise<{ rows: ShiftListRow[]; total: number }>
  /** Shift tối giản (id/status/openedAt) — cho export route */
  findByIdExport(shiftId: string): Promise<{ id: string; status: string; openedAt: Date } | null>
  /** Điều chỉnh cashDifference (chỉ ca CLOSED) — PATCH /api/reports/shifts/[id] */
  adjustCashDifference(shiftId: string, data: { cashDifference: number; notes?: string }): Promise<{ id: string; cashDifference: number; notes: string | null; updatedAt: Date }>
}

/** Dòng ca trong danh sách — GET /api/shifts (groupByDay + list) */
export type ShiftListRow = Prisma.ShiftGetPayload<{
  include: {
    staff: { select: { id: true; fullName: true } }
    _count: { select: { sessions: true; payments: true } }
    toolCounts: {
      include: { tool: { select: { id: true; name: true; quantity: true; isRequired: true } } }
    }
  }
}>

export interface ShiftListFilter {
  from: Date
  to: Date
  status?: 'OPEN' | 'CLOSED'
  /** Nếu STAFF: chỉ ca staff mở hoặc tham gia */
  staffId?: string
  skip: number
  take: number
  includeParticipants?: 'all' | 'active'
}

export interface ShiftReportRow {
  id: string
  staffId: string
  openedAt: Date
  closedAt: Date | null
  openingCash: unknown
  closingCash: unknown
  expectedCash: unknown
  cashDifference: unknown
  status: string
  notes: string | null
  staff: { id: string; fullName: string }
  participants: Array<{
    id: string
    role: string
    joinedAt: Date
    leftAt: Date | null
    staff: { id: string; fullName: string }
  }>
  toolCounts: Array<{
    id: string
    toolId: string
    tool: { id: string; name: string; quantity: number; isRequired: boolean }
    openCount: number
    closeCount: number | null
  }>
  _count: { sessions: number }
}
