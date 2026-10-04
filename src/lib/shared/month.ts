// ── Pure month helpers (giờ Việt Nam) — dùng chung cho các màn theo tháng ─────
import { toInputDate } from './utils'

export interface Month {
  year: number
  /** 1–12 */
  month: number
}

/** Khoá "YYYY-MM" của một tháng — dùng cho query param. */
export function monthKey({ year, month }: Month): string {
  return `${year}-${String(month).padStart(2, '0')}`
}

/** Tháng hiện tại theo giờ Việt Nam. */
export function currentMonth(now = new Date()): Month {
  const [year, month] = toInputDate(now).split('-').map(Number)
  return { year, month }
}

/** Dịch chuyển tháng (delta âm = lùi, dương = tiến), tự cuộn qua năm. */
export function shiftMonth({ year, month }: Month, delta: number): Month {
  const shifted = new Date(Date.UTC(year, month - 1 + delta, 1))
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1 }
}

/** Khoảng ngày của tháng, chặn trên ở hôm nay — cho chọn ngày / hiển thị. */
export function monthRange({ year, month }: Month, now = new Date()): { from: string; to: string } {
  const from = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)
  const today = toInputDate(now)
  return { from, to: lastDay > today ? today : lastDay }
}

/** Khoảng dữ liệu cả tháng [from, to) — KHÔNG chặn ở hôm nay, dùng để query DB. */
export function monthBounds({ year, month }: Month): { from: string; to: string } {
  const from = `${year}-${String(month).padStart(2, '0')}-01`
  const to = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10)
  return { from, to }
}

/** Tháng đang chọn có phải tháng hiện tại — dùng để chặn nút "tháng sau". */
export function isCurrentMonth(month: Month, now = new Date()): boolean {
  const current = currentMonth(now)
  return current.year === month.year && current.month === month.month
}

/** Nhãn hiển thị "Tháng M/YYYY". */
export function formatMonthLabel({ year, month }: Month): string {
  return `Tháng ${month}/${year}`
}
