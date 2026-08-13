import { formatVND, roundToNearestThousand } from '@/lib/shared/utils'
import {
  calculatePlayPrice,
  calculateTieredSubtotal,
  type PromotionSnapshot,
} from '@/lib/promotion-calculation'

export function toNumber(value: number | string | null | undefined): number {
  return Number(value ?? 0)
}

export function money(value: number | string | null | undefined, roundToThousands = true): string {
  const num = toNumber(value)
  return formatVND(roundToThousands ? roundToNearestThousand(num) : num)
}

export function formatClock(dateValue: string | Date): string {
  return new Date(dateValue).toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatDay(dateValue: string | Date): string {
  return new Date(dateValue).toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

export function calcElapsedHMS(startTime: string, endTime?: string | Date, pausedSeconds = 0): string {
  const end = endTime ? new Date(endTime).getTime() : Date.now()
  const diffMs = end - new Date(startTime).getTime() - pausedSeconds * 1000
  if (diffMs < 0) return '00:00:00'

  const totalSeconds = Math.floor(diffMs / 1000)
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60

  return [h, m, s].map((v) => v.toString().padStart(2, '0')).join(':')
}

/** Format số giây → HH:MM:SS (dùng cho thời gian đã tạm dừng) */
export function formatPausedHMS(pausedSeconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(pausedSeconds))
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  return [h, m, s].map((v) => v.toString().padStart(2, '0')).join(':')
}

/**
 * Tổng số giây đã tạm dừng: tích lũy + phần đang paused (nếu đang dừng).
 * `now` cho phép chốt theo thời điểm cố định (vd frozenAt khi checkout) —
 * mặc định tính tới hiện tại để thẻ tick live mỗi giây.
 */
export function pausedSecondsUntil(
  pausedAt?: string | Date | null,
  totalPausedSeconds = 0,
  now?: number
): number {
  const base = Math.max(0, totalPausedSeconds)
  if (!pausedAt) return base
  return base + Math.max(0, Math.round(((now ?? Date.now()) - new Date(pausedAt).getTime()) / 1000))
}

export function calcCurrentPlayCost(
  startTime: string,
  hourlyRate: number | string,
  promotion?: PromotionSnapshot | null,
  tiers?: { minHours: number; ratePerHour: number }[],
  playerCount = 1,
): number {
  const diffMs = Date.now() - new Date(startTime).getTime()
  if (diffMs < 0) return 0

  const totalHours = Math.round((diffMs / (1000 * 60 * 60)) * 100) / 100

  // Tính subtotal theo bảng giá luỹ tiến nếu có tiers
  const subtotal = tiers && tiers.length > 0
    ? calculateTieredSubtotal(toNumber(hourlyRate), tiers, totalHours)
    : undefined

  const perPerson = calculatePlayPrice({
    totalHours,
    hourlyRate: toNumber(hourlyRate),
    promotion,
    subtotal,
  }).grandTotal

  return perPerson * playerCount
}

export function paymentMethodLabel(method: string): string {
  if (method === 'CASH') return 'Tiền mặt'
  if (method === 'TRANSFER') return 'Chuyển khoản'
  if (method === 'CARD') return 'Thẻ'
  if (method === 'MEMBER') return 'Hội viên'
  return method
}
