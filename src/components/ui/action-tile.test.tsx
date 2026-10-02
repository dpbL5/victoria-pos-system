import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { CheckCircle2, LogIn } from 'lucide-react'
import { ActionTile } from './action-tile'
import { buttonClass } from './button'

describe('ActionTile — ô hành động lớn, mẫu chung của hệ thống', () => {
  it('tone primary dùng chính xác màu nút hành động chính (contrast)', () => {
    const html = renderToStaticMarkup(<ActionTile label="Check-in" icon={LogIn} tone="primary" />)
    expect(html).toContain(buttonClass({ variant: 'contrast', size: 'sm' }))
  })

  it('mặc định 56px (min-h-14) — cỡ của hàng hành động chính ở màn Ca hôm nay', () => {
    const html = renderToStaticMarkup(<ActionTile label="Bán lẻ" icon={LogIn} />)
    expect(html).toContain('min-h-14')
    expect(html).toContain('whitespace-nowrap')
  })

  it('size="sm" dành cho hàng dày (44px), vẫn giữ cỡ nhãn 12px', () => {
    const html = renderToStaticMarkup(<ActionTile label="Có mặt" icon={CheckCircle2} size="sm" />)
    expect(html).toContain('min-h-11')
    expect(html).toContain('text-xs')
  })

  it('không tự phát sinh hai class cỡ chữ xung đột', () => {
    // Tailwind chọn theo thứ tự trong bảng CSS, không theo thứ tự class viết ra,
    // nên một `text-sm` lẫn vào sẽ âm thầm đổi cỡ nhãn mà không ai thấy.
    for (const size of ['sm', 'md'] as const) {
      const html = renderToStaticMarkup(<ActionTile label="X" icon={LogIn} size={size} />)
      const sizes = ['text-xs', 'text-sm', 'text-base', 'text-lg'].filter((k) => html.includes(k))
      expect(sizes, size).toEqual(['text-xs'])
    }
  })

  it('mọi tone đều có focus ring, disabled và nhịp nhấn', () => {
    for (const tone of ['primary', 'secondary', 'success', 'danger'] as const) {
      const html = renderToStaticMarkup(<ActionTile label="X" icon={LogIn} tone={tone} />)
      expect(html, tone).toContain('focus-visible:ring-focus-ring')
      expect(html, tone).toContain('disabled:opacity-50')
      expect(html, tone).toContain('motion-press')
    }
  })

  it('ô trạng thái: có active thì lên màu tone, không thì rơi về nền xám', () => {
    const on = renderToStaticMarkup(<ActionTile label="Có mặt" icon={CheckCircle2} tone="success" active />)
    expect(on).toContain(buttonClass({ variant: 'success', size: 'sm' }))
    expect(on).toContain('aria-pressed="true"')

    const off = renderToStaticMarkup(<ActionTile label="Có mặt" icon={CheckCircle2} tone="success" active={false} />)
    expect(off).toContain(buttonClass({ variant: 'grey', size: 'sm' }))
    expect(off).toContain('aria-pressed="false"')
  })

  it('hành động thường không phát aria-pressed (không phải toggle)', () => {
    expect(renderToStaticMarkup(<ActionTile label="Bán kèm" icon={LogIn} />)).not.toContain('aria-pressed')
  })

  it('layout="column" xếp dọc và phóng to icon + chữ', () => {
    const row = renderToStaticMarkup(<ActionTile label="Check-in" icon={LogIn} />)
    const col = renderToStaticMarkup(<ActionTile label="Check-in" icon={LogIn} layout="column" />)

    expect(row).not.toContain('flex-col')
    // Mọi class của kiểu cột đều tiền tố `lg:` — dưới lg giữ hàng ngang
    expect(col).toContain('lg:flex-col')
    expect(col).not.toMatch(/(^|\s)flex-col/)
    expect(col).toContain('lg:h-7 lg:w-7')
    expect(col).toContain('lg:!text-base')
    expect(col).toContain('lg:!gap-2.5')
    // Không có class không tiền tố lg nào (kiểm theo ranh giới class)
    expect(col).not.toMatch(/(^|[\s"])!text-/)
    expect(col).not.toMatch(/(^|[\s"])flex-col/)
    expect(col).not.toMatch(/(^|[\s"])h-[67] w-[67]/)
  })

  it('href render thành Link, không render thành button', () => {
    const html = renderToStaticMarkup(<ActionTile label="Đặt lịch" icon={LogIn} href="/bookings" />)
    expect(html).toContain('href="/bookings"')
    expect(html).not.toContain('<button')
  })

  it('disabled chặn bấm và loading hiện vòng quay thay icon', () => {
    expect(renderToStaticMarkup(<ActionTile label="X" icon={LogIn} disabled />)).toContain('disabled')
    expect(renderToStaticMarkup(<ActionTile label="X" icon={LogIn} loading />)).toContain('animate-spin')
  })

  it('mọi ô đều mang data-action-tile để đo được kích thước thật trong browser', () => {
    expect(renderToStaticMarkup(<ActionTile label="X" icon={LogIn} />)).toContain('data-action-tile="md"')
    expect(renderToStaticMarkup(<ActionTile label="X" icon={LogIn} size="sm" />)).toContain('data-action-tile="sm"')
  })
})
