// ── Sổ đối soát ca — hàm thuần, có test (shift-ledger.test.ts) ──────────────
// Màn Ca làm chỉ giữ KẾT LUẬN đối soát; hai vế DỰ KIẾN / THỰC ĐẾM nằm ở màn
// Giao dịch trong ca. Mọi phép tính tiền của hai màn nằm ở đây, không tính lại
// trong JSX.
//
// Quy ước số:
// · Dự kiến = tiền đầu ca + tiền mặt thu trong ca. Ca đã đóng dùng số đã chốt ở
//   server (`expectedCash`) — đó là con số két được kiểm lúc đóng ca; ca đang mở
//   chỉ có số tạm tính khi payload có `revenue.cashRevenue`, thiếu thì trả `null`
//   chứ không bịa số 0.
// · Thực đếm = `closingCash` (chỉ có khi ca đã đóng).
// · Lệch = thực đếm − dự kiến: âm = thiếu, dương = thừa, 0 = khớp.

import { formatVnDate, formatVnDateTime, toInputDate } from '@/lib/shared/utils'

export type BalanceVerdict = 'matched' | 'short' | 'over' | 'uncounted'

export interface LedgerMoney {
  status: string
  openingCash?: number | string | null
  expectedCash?: number | string | null
  closingCash?: number | string | null
  cashDifference?: number | string | null
  revenue?: { cashRevenue?: number | string | null } | null
}

export interface ShiftLedger {
  /** `null` khi chưa có cơ sở để tính (ca đang mở mà payload thiếu doanh thu) */
  expected: number | null
  counted: number | null
  difference: number | null
  verdict: BalanceVerdict
}

const num = (value: unknown) => Number(value ?? 0)

function verdictOf(difference: number): BalanceVerdict {
  if (difference === 0) return 'matched'
  return difference < 0 ? 'short' : 'over'
}

export function shiftLedger(shift: LedgerMoney): ShiftLedger {
  const closed = shift.status === 'CLOSED'
  const cashRevenue = shift.revenue?.cashRevenue
  const expected =
    closed && shift.expectedCash != null
      ? num(shift.expectedCash)
      : cashRevenue != null
        ? num(shift.openingCash) + num(cashRevenue)
        : null
  const counted = shift.closingCash != null ? num(shift.closingCash) : null
  if (counted == null || expected == null) {
    return { expected, counted, difference: null, verdict: 'uncounted' }
  }
  const difference =
    shift.cashDifference != null ? num(shift.cashDifference) : counted - expected
  return { expected, counted, difference, verdict: verdictOf(difference) }
}

export interface DayLedger {
  verdict: BalanceVerdict
  /** tổng lệch của các ca đã đếm (chỉ có nghĩa khi `countedCount > 0`) */
  difference: number
  /** số ca đã đếm được gộp vào kết luận của ngày */
  countedCount: number
  /** số ca chưa đếm (đang mở, hoặc đóng nhưng thiếu số) — không gộp vào kết luận */
  unsettledCount: number
}

/** Dòng cân tổng của ngày: chỉ gộp các ca đã đếm, để kết luận còn đúng nghĩa. */
export function dayLedger(shifts: LedgerMoney[]): DayLedger {
  let difference = 0
  let countedCount = 0
  let unsettledCount = 0

  for (const shift of shifts) {
    const ledger = shiftLedger(shift)
    if (ledger.counted == null || ledger.difference == null) {
      unsettledCount++
      continue
    }
    difference += ledger.difference
    countedCount++
  }

  return {
    verdict: countedCount === 0 ? 'uncounted' : verdictOf(difference),
    difference,
    countedCount,
    unsettledCount,
  }
}

export type ToolVerdict = 'matched' | 'mismatched' | 'uncounted'

/** Đối soát một dụng cụ: chưa nhập số cuối ca thì chưa kết luận được. */
export function toolVerdict(
  openCount: number,
  closeCount?: number | null,
): ToolVerdict {
  if (closeCount == null) return 'uncounted'
  return closeCount === openCount ? 'matched' : 'mismatched'
}

export interface LedgerParticipant {
  id: string
  leftAt?: string | null
  staff: { id: string; fullName: string }
}

/** Người cùng ca (không lặp người mở ca) — tối đa 3 tên, phần dư gộp thành +N. */
export function participantNote(
  participants: LedgerParticipant[],
  openerId?: string | null,
): string | null {
  const others = participants.filter((row) => row.staff.id !== openerId)
  if (others.length === 0) return null

  const active = others.filter((row) => !row.leftAt)
  const leftCount = others.length - active.length
  if (active.length === 0) return `${leftCount} người đã rời ca`

  const shown = active.slice(0, 3)
  const extra = active.length - shown.length
  const names =
    shown.map((row) => row.staff.fullName).join(', ') + (extra > 0 ? ` +${extra}` : '')
  return `Cùng ca: ${names}${leftCount > 0 ? ` (+${leftCount} đã rời)` : ''}`
}

const VN_WEEKDAY = [
  'Chủ nhật',
  'Thứ Hai',
  'Thứ Ba',
  'Thứ Tư',
  'Thứ Năm',
  'Thứ Sáu',
  'Thứ Bảy',
]

/**
 * Nhãn giờ mở–đóng của ca: "Ca 08:12 – 16:40".
 * Ca đóng ở một NGÀY khác thì kèm ngày đóng — nếu không, "Ca 10:28 – 14:06"
 * đứng cạnh "75 giờ 38 phút" đọc như mâu thuẫn, vì ca đã qua ngày.
 */
export function shiftTimeRange(openedAt: string, closedAt?: string | null): string {
  const openTime = formatVnDateTime(openedAt).split(' ')[1]
  if (!closedAt) return `Ca ${openTime}`
  const closeTime = formatVnDateTime(closedAt).split(' ')[1]
  const sameDay = toInputDate(new Date(openedAt)) === toInputDate(new Date(closedAt))
  return `Ca ${openTime} – ${sameDay ? closeTime : `${closeTime} ${formatVnDate(closedAt).slice(0, 5)}`}`
}

/**
 * Nhãn ngày từ khoá `YYYY-MM-DD` (giờ VN): "Thứ Bảy, 03/10/2026".
 * Dựng thẳng từ khoá bằng UTC — không parse thành Date rồi đọc theo múi giờ máy
 * người dùng, vì máy lệch múi giờ sẽ in lùi một ngày so với nhóm của server.
 */
export function dayLabel(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number)
  const weekday = VN_WEEKDAY[new Date(Date.UTC(year, month - 1, day)).getUTCDay()]
  return `${weekday}, ${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`
}

export function formatShiftDuration(
  openedAt: string,
  closedAt?: string | null,
): string {
  const start = new Date(openedAt).getTime()
  const end = closedAt ? new Date(closedAt).getTime() : start
  const totalMinutes = Math.max(0, Math.round((end - start) / 60000))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours === 0) return `${minutes} phút`
  if (minutes === 0) return `${hours} giờ`
  return `${hours} giờ ${minutes} phút`
}
