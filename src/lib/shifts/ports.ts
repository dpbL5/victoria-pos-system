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
  /** Đóng ca — trả về shift CLOSED kèm participants */
  close(shiftId: string, data: CloseShiftData): Promise<OpenShiftDetail>
  /** Thêm/khôi phục participant của ca (join) */
  upsertParticipant(shiftId: string, staffId: string): Promise<void>
  /** findUniqueOrThrow với include participants — throw P2025 nếu không tồn tại */
  findByIdOrThrow(shiftId: string): Promise<OpenShiftDetail>
  /** Tạo ca mới với participant LEAD + toolCounts */
  createWithLead(data: {
    staffId: string
    openingCash: number
    notes?: string
    toolCounts?: ToolCountEntry[]
  }): Promise<OpenShiftDetail>
}
