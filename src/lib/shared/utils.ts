export function formatVND(amount: number | string): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount
  return `${num.toLocaleString('vi-VN')}đ`
}

/**
 * Rút gọn `invoiceNo` cho list views: chỉ giữ phần cuối sau dấu `-` cuối cùng.
 * Ví dụ: `INV-20260828-222614-35E7A9DE` → `35E7A9DE`.
 * Dùng cho danh sách giao dịch, lịch sử hoá đơn của khách. Màn chi tiết vẫn hiển thị đầy đủ.
 * Trả về nguyên chuỗi nếu không có dấu `-` (fallback an toàn).
 */
export function shortInvoiceNo(invoiceNo: string): string {
  const idx = invoiceNo.lastIndexOf('-')
  return idx === -1 ? invoiceNo : invoiceNo.slice(idx + 1)
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

/** Khoảng ngày lịch hiện tại theo giờ Việt Nam, kết thúc ở hôm nay. */
export function getVnCalendarRange(period: 'day' | 'week' | 'month' | 'year', now = new Date()): { from: string; to: string } {
  const to = toInputDate(now)
  const [year, month, day] = to.split('-').map(Number)
  const start = new Date(Date.UTC(year, month - 1, day))

  if (period === 'week') start.setUTCDate(day - ((start.getUTCDay() + 6) % 7))
  if (period === 'month') start.setUTCDate(1)
  if (period === 'year') start.setUTCMonth(0, 1)

  return { from: start.toISOString().slice(0, 10), to }
}

/** Khoảng tuần thứ Hai đến trước thứ Hai kế tiếp của một ngày theo lịch Việt Nam. */
export function getVnWeekRange(value: string): { from: string; to: string } {
  const [year, month, day] = value.split('-').map(Number)
  const start = new Date(Date.UTC(year, month - 1, day))
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7))
  const end = new Date(start)
  end.setUTCDate(end.getUTCDate() + 7)
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) }
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

const toMs = (value: string | Date) => (typeof value === 'string' ? Date.parse(value) : value.getTime())

/** 'YYYY-MM-DDTHH:mm' theo giờ Việt Nam — nguồn chung cho mọi hàm hiển thị bên dưới. */
const vnIso = (value: string | Date) => new Date(toMs(value) + VN_OFFSET_MS).toISOString()

/** dd/MM/yyyy theo giờ Việt Nam (cố định, không phụ thuộc múi giờ máy người dùng). */
export function formatVnDate(value: string | Date): string {
  const [y, m, d] = vnIso(value).slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

/** dd/MM/yyyy HH:mm theo giờ Việt Nam. */
export function formatVnDateTime(value: string | Date): string {
  const [date, time] = vnIso(value).slice(0, 16).split('T')
  const [y, m, d] = date.split('-')
  return `${d}/${m}/${y} ${time}`
}

/** HH:mm theo giờ Việt Nam. */
function formatVnTime(value: string | Date): string {
  return vnIso(value).slice(11, 16)
}

/** Khoảng giờ của một buổi: 'HH:mm–HH:mm' theo giờ Việt Nam. */
export function formatVnTimeRange(start: string | Date, durationMin: number): string {
  const end = new Date(toMs(start) + durationMin * 60_000)
  return `${formatVnTime(start)}–${formatVnTime(end)}`
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
