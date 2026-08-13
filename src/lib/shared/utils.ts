export function formatVND(amount: number | string): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount
  return `${num.toLocaleString('vi-VN')}đ`
}

/** Làm tròn lên hàng nghìn (mặc định dùng cho tất cả màn POS). */
export function roundToNearestThousand(amount: number | string): number {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount
  return Math.ceil(num / 1000) * 1000
}

export function formatHours(hours: number): string {
  const h = Math.floor(hours)
  const m = Math.round((hours - h) * 60)
  if (m === 0) return `${h}h`
  return `${h}h${m}p`
}

export function calcHours(start: Date, end: Date, pausedSeconds = 0): number {
  const diffMs = end.getTime() - start.getTime() - pausedSeconds * 1000
  return Math.round((diffMs / (1000 * 60 * 60)) * 100) / 100
}

const VN_OFFSET_MS = 7 * 60 * 60 * 1000

export function today(): string {
  return toInputDate(new Date())
}

/** Format a Date as "YYYY-MM-DD" in Vietnam timezone (UTC+7). */
export function toInputDate(date: Date): string {
  const vnMs = date.getTime() + VN_OFFSET_MS
  const d = new Date(vnMs)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Trả về thời điểm 00:00:00.000 giờ Việt Nam của ngày `value` (UTC+7). */
export function parseStartOfDay(value: string): Date {
  const [y, m, d] = value.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d) - VN_OFFSET_MS)
}

/** Trả về thời điểm 23:59:59.999 giờ Việt Nam của ngày `value` (UTC+7). */
export function parseEndOfDay(value: string): Date {
  const [y, m, d] = value.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + 1) - VN_OFFSET_MS - 1)
}

export function getDayType(date: Date = new Date()): import('@/types').DayType {
  const day = getVnDay(date)
  return day === 0 || day === 6 ? 'WEEKEND' : 'WEEKDAY'
}

export function getVnHour(date: Date): number {
  return new Date(date.getTime() + VN_OFFSET_MS).getUTCHours()
}

export function getVnDay(date: Date): number {
  return new Date(date.getTime() + VN_OFFSET_MS).getUTCDay()
}

// ── Date-only string → local-time Date (tránh lệch múi giờ UTC) ──
// new Date("2026-07-11") → midnight UTC = 7:00 sáng giờ VN → sai với mong đợi người dùng.
// Các hàm bên dưới dùng constructor (year, month-1, day) để lấy midnight theo giờ địa phương.

/**
 * Biến chuỗi date-only "YYYY-MM-DD" thành Date lúc 00:00:00.000 giờ Việt Nam (UTC+7).
 * Dùng cho `effectiveFrom` của bảng giá và các trường ngày hiệu lực bắt đầu.
 */
export function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day) - VN_OFFSET_MS)
}

/**
 * Biến chuỗi date-only "YYYY-MM-DD" thành Date lúc 23:59:59.999 giờ Việt Nam (UTC+7).
 * Dùng cho `effectiveTo` để ngày kết thúc bao phủ hết ngày.
 */
export function parseLocalDateEnd(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day + 1) - VN_OFFSET_MS - 1)
}
