import { describe, expect, it } from 'vitest'
import { filterBookingsBySearch, isBookingOnVnDay, isBookingOverdue, type BookingItem } from './booking-list'

const booking = (overrides: Partial<BookingItem> = {}): BookingItem => ({
 id: 'booking-1',
 scheduledAt: '2026-09-30T02:00:00.000Z',
 playerCount: 1,
 depositAmount: 0,
 depositAppliedAmount: 0,
 depositRefundedAmount: 0,
 customerName: 'Nguyễn An',
 customerPhone: null,
 status: 'BOOKED',
 customer: null,
 ...overrides,
})

describe('isBookingOverdue', () => {
 it('only marks an unprocessed booking as overdue after its scheduled time', () => {
 const now = Date.parse('2026-09-30T02:00:00.001Z')

 expect(isBookingOverdue(booking(), now)).toBe(true)
 expect(isBookingOverdue(booking({ scheduledAt: '2026-09-30T02:00:00.001Z' }), now)).toBe(false)
 expect(isBookingOverdue(booking({ status: 'CHECKED_IN' }), now)).toBe(false)
 })
})

// `GET /api/bookings` trả cả tuần, nên màn Ca hôm nay tự lọc theo NGÀY giờ VN.
// Nửa đêm VN là 17:00 UTC — đúng chỗ dễ sai nếu so sánh bằng giờ máy.
describe('isBookingOnVnDay', () => {
 const now = Date.parse('2026-10-01T16:59:00.000Z') // 23:59 ngày 01/10 giờ VN

 it('giữ lịch trong ngày VN hiện tại, kể cả 23:30', () => {
  expect(isBookingOnVnDay(booking({ scheduledAt: '2026-10-01T16:30:00.000Z' }), now)).toBe(true)
  expect(isBookingOnVnDay(booking({ scheduledAt: '2026-10-01T00:05:00.000Z' }), now)).toBe(true)
 })

 it('loại lịch đã sang ngày kế tiếp theo giờ VN (00:01 hôm sau)', () => {
  expect(isBookingOnVnDay(booking({ scheduledAt: '2026-10-01T17:01:00.000Z' }), now)).toBe(false)
 })

 it('loại lịch của ngày mai và hôm qua', () => {
  expect(isBookingOnVnDay(booking({ scheduledAt: '2026-10-02T03:00:00.000Z' }), now)).toBe(false)
  expect(isBookingOnVnDay(booking({ scheduledAt: '2026-09-30T03:00:00.000Z' }), now)).toBe(false)
 })
})

// Tìm nhanh trong khối Lịch đặt: gõ không dấu vẫn phải ra tên có dấu.
describe('filterBookingsBySearch', () => {
 const list = [
  booking({ id: 'booking-1', customerName: 'Nguyễn An', customerPhone: '0912345678' }),
  booking({ id: 'booking-2', customerName: 'Trần Bình', customerPhone: null }),
  booking({
   id: 'booking-3',
   customerName: null,
   customerPhone: null,
   customer: { id: 'customer-1', fullName: 'Lê Văn Cường', phone: '0900000000', type: 'MEMBER' },
  }),
 ]

 it('khớp tên có dấu khi gõ không dấu (và ngược lại)', () => {
  expect(filterBookingsBySearch(list, 'nguyen').map((b) => b.id)).toEqual(['booking-1'])
  expect(filterBookingsBySearch(list, 'Nguyễn An').map((b) => b.id)).toEqual(['booking-1'])
  expect(filterBookingsBySearch(list, 'cuong').map((b) => b.id)).toEqual(['booking-3'])
 })

 it('khớp SĐT, ưu tiên thông tin từ customer khi có', () => {
  expect(filterBookingsBySearch(list, '0900').map((b) => b.id)).toEqual(['booking-3'])
  expect(filterBookingsBySearch(list, '0912').map((b) => b.id)).toEqual(['booking-1'])
 })

 it('từ khoá rỗng trả về nguyên danh sách', () => {
  expect(filterBookingsBySearch(list, '')).toBe(list)
  expect(filterBookingsBySearch(list, '   ')).toBe(list)
 })
})
