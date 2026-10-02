import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ShiftGate } from './shift-gate'

/**
 * Chế độ A của màn Ca hôm nay. ADMIN luôn có `shiftReady = true` nên không bao
 * giờ thấy được chế độ này trong app thật — không có cách nào chụp màn hình nó
 * mà không tạo dữ liệu thật. Đây là bài kiểm tra thay cho lần chụp đó: nó chốt
 * hai điều quan trọng nhất của chế độ A.
 */
describe('ShiftGate — chế độ chưa mở ca', () => {
  const noop = () => {}

  it('không render nút disabled nào — cả màn chỉ còn một việc', () => {
    const html = renderToStaticMarkup(
      <ShiftGate openShiftAt={null} submitting={false} onOpen={noop} />
    )

    // React render thuộc tính boolean thật thành `disabled=""`; chuỗi `disabled:`
    // trong class Tailwind (variant) không tính.
    expect(html).not.toContain('disabled=""')
    expect(html).toContain('Chưa mở ca')
    expect(html).toContain('Mở ca')
  })

  it('không dùng scrim/overlay — chế độ A là cả màn hình, không phải modal', () => {
    const html = renderToStaticMarkup(
      <ShiftGate openShiftAt={null} submitting={false} onOpen={noop} />
    )

    expect(html).not.toContain('fixed inset-0')
    expect(html).not.toContain('backdrop-blur')
  })

  it('có ca quầy đang mở thì đổi thành lời mời THAM GIA, không phải mở ca mới', () => {
    const html = renderToStaticMarkup(
      <ShiftGate openShiftAt="2026-09-30T01:53:22.605Z" submitting={false} onOpen={noop} />
    )

    expect(html).toContain('Có ca quầy đang mở')
    expect(html).toContain('Tham gia ca')
    expect(html).not.toContain('Chưa mở ca')
  })
})
