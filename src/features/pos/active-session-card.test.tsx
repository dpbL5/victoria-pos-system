import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { parseStartOfDay, today } from '@/lib/shared/utils'
import { ActiveSessionCard } from './active-session-card'
import type { SessionRow } from './types'

// ── Chế độ chỉ xem của thẻ phiên ───────────────────────────────────────────
// ADMIN/MANAGER xem được phiên đang chơi khi chưa vào ca, nhưng thẻ phiên phải
// KHÔNG render nút thao tác nào — không phải nút xám. Nút xám vẫn là lời mời
// bấm rồi báo lỗi (backend trả SHIFT_REQUIRED cho mọi thao tác tiền).
const session: SessionRow = {
  id: 'session-1',
  startTime: '2026-10-01T01:00:00.000Z',
  status: 'ACTIVE',
  hourlyRate: 0,
  playerCount: 1,
  customerName: 'Khách #001',
  customer: null,
  staff: { id: 'staff-1', fullName: 'Nguyễn An' },
}

const noop = () => {}

describe('ActiveSessionCard — chế độ chỉ xem', () => {
  it('readOnly: không có nút Dừng/Thu, chỉ còn tên khách', () => {
    const html = renderToStaticMarkup(
      <ActiveSessionCard session={session} readOnly onCheckout={noop} onPause={noop} onResume={noop} />
    )

    expect(html).toContain('Khách #001')
    // Khớp đúng nhãn nút (`Button` bọc chữ trong `<span class="button-label">`),
    // để không bắt nhầm chữ khác chứa "Thu"/"Dừng" như nút "Thu gọn".
    expect(html).not.toContain('>Thu</span>')
    expect(html).not.toContain('>Dừng</span>')
  })

  it('người trực ca: vẫn đủ nút Dừng và Thu', () => {
    const html = renderToStaticMarkup(
      <ActiveSessionCard session={session} onCheckout={noop} onPause={noop} onResume={noop} />
    )

    expect(html).toContain('>Thu</span>')
    expect(html).toContain('>Dừng</span>')
  })

  it('readOnly không render nút disabled nào trong thẻ', () => {
    const html = renderToStaticMarkup(
      <ActiveSessionCard session={session} readOnly onCheckout={noop} onPause={noop} onResume={noop} />
    )

    expect(html).not.toContain('disabled=""')
  })
})

// ── Phiên ACTIVE sót từ hôm trước ──────────────────────────────────────────
// Thẻ chỉ in `HH:mm` thì phiên mở 2 ngày trước trông y hệt phiên vừa mở, và
// không ai biết còn một phiên chưa thu để chốt trước khi đóng ca.
describe('ActiveSessionCard — nhãn ngày của phiên chưa thu', () => {
  // Mốc cố định theo NGÀY giờ VN để test không phụ thuộc giờ chạy.
  const todayStart = parseStartOfDay(today()).getTime()
  const runningFrom = (startTime: number): SessionRow => ({
    ...session,
    startTime: new Date(startTime).toISOString(),
  })
  const render = (s: SessionRow) => renderToStaticMarkup(
    <ActiveSessionCard session={s} onCheckout={noop} onPause={noop} onResume={noop} />
  )

  it('phiên mở hôm qua: hiện "Hôm qua" + giờ, tô màu cảnh báo', () => {
    const html = render(runningFrom(todayStart - 24 * 60 * 60 * 1000))

    expect(html).toContain('Hôm qua')
    expect(html).toContain('text-warning')
  })

  it('phiên mở trong ngày hôm nay: chỉ có giờ, không nhãn ngày, không màu cảnh báo', () => {
    const html = render(runningFrom(todayStart))

    expect(html).not.toContain('Hôm qua')
    expect(html).not.toContain('text-warning')
  })

  it('phiên cũ hơn: rơi về ngày cụ thể dd/MM/yyyy', () => {
    const html = render(runningFrom(todayStart - 3 * 24 * 60 * 60 * 1000))

    expect(html).not.toContain('Hôm qua')
    expect(html).toContain('/')
    expect(html).toContain('text-warning')
  })
})
