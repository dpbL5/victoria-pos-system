import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { BookingCards, type BookingItem } from './booking-list'

/**
 * Hàng lịch đặt (section "Lịch đặt trong ngày" trên màn Ca).
 *
 * Dữ liệu thật chỉ cho xem một trạng thái (quá giờ + còn cọc), nên ba nhánh còn
 * lại — chưa tới giờ, quá giờ mà hết cọc, và danh sách rỗng — chỉ khoá được ở đây.
 * Quá giờ thì luôn có nút Huỷ; còn cọc thì dialog hỏi "đã hoàn cọc chưa" trước khi huỷ.
 *
 * Khuôn hàng bám theo thẻ người đang chơi: cột trái danh tính + meta, cột phải
 * con số (ở thẻ phiên là đồng hồ, ở lịch đặt là tiền cọc) rồi hai nút nhỏ cạnh
 * nhau như Dừng/Thu.
 */

const noop = () => {}

const booking = (overrides: Partial<BookingItem> = {}): BookingItem => ({
  id: 'booking-1',
  scheduledAt: '2099-01-01T02:00:00.000Z',
  playerCount: 2,
  depositAmount: 0,
  depositAppliedAmount: 0,
  depositRefundedAmount: 0,
  customerName: 'Nguyễn An',
  customerPhone: '0912345678',
  status: 'BOOKED',
  customer: null,
  ...overrides,
})

const render = (overrides: Partial<BookingItem> = {}) =>
  renderToStaticMarkup(<BookingCards bookings={[booking(overrides)]} onCheckIn={noop} onCancel={noop} />)

const PAST = '2020-01-01T02:00:00.000Z'
const CANCEL_BUTTON = 'aria-label="Hủy lịch"'

describe('BookingCards — hàng lịch đặt', () => {
  it('tiền cọc giữ slot con số của cột phải (như đồng hồ ở thẻ phiên chơi)', () => {
    const html = render({ depositAmount: 100000 })
    // Cỡ con số hiển thị, tabular-nums — không phải cỡ chữ meta.
    expect(html).toContain('whitespace-nowrap text-base font-semibold text-success')
    expect(html).toContain('tabular-nums')
  })

  it('nút hành động dùng size sm và bố cục hàng ngang như Dừng/Thu', () => {
    const html = render({ scheduledAt: PAST })
    // size sm = px-3 py-1.5. Phải soi trong từng thẻ <button>: <li> cũng mang
    // px-4 py-3 cho padding của hàng, nên so khớp cả chuỗi sẽ bắt nhầm.
    expect(html).toContain('px-3 py-1.5')
    const buttons = html.match(/<button[^>]*>/g) ?? []
    expect(buttons.length).toBeGreaterThan(0)
    for (const button of buttons) expect(button).not.toContain('py-3')
    expect(html).toContain('flex min-w-0 flex-nowrap items-center gap-1.5')
  })

  it('chưa tới giờ, không cọc: tên + meta + một nút, không nhãn trạng thái', () => {
    const html = render()
    expect(html).toContain('Nguyễn An')
    expect(html).toContain('2 người')
    expect(html).toContain('0912345678')
    expect(html).toContain('Xác nhận')
    expect(html).not.toContain('Quá giờ hẹn')
    expect(html).not.toContain('Đã cọc')
    expect(html).not.toContain(CANCEL_BUTTON)
  })

  it('quá giờ mà còn cọc: có nhãn + vẫn render nút Huỷ (dialog hỏi hoàn cọc)', () => {
    const html = render({ scheduledAt: PAST, depositAmount: 100000 })
    expect(html).toContain('Quá giờ hẹn')
    expect(html).toContain('Đã cọc')
    expect(html).toContain('Xác nhận')
    // Cọc không chặn huỷ nữa — dialog xác nhận "đã hoàn cọc chưa" lo phần đó.
    expect(html).toContain(CANCEL_BUTTON)
  })

  it('quá giờ và đã hết cọc: hiện đủ hai nút', () => {
    const html = render({ scheduledAt: PAST })
    expect(html).toContain('Quá giờ hẹn')
    expect(html).not.toContain('Đã cọc')
    expect(html).not.toContain('xử lý trước khi hủy')
    expect(html).toContain('Xác nhận')
    expect(html).toContain(CANCEL_BUTTON)
  })

  it('danh sách rỗng: không render gì (màn Ca tự lo dòng trống)', () => {
    expect(renderToStaticMarkup(<BookingCards bookings={[]} onCheckIn={noop} onCancel={noop} />)).toBe('')
  })
})
