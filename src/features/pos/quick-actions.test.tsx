import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { QuickActions } from './quick-actions'

describe('QuickActions — màu 3 tile hành động màn Ca', () => {
  const noop = () => {}

  it('Check-in đảo màu, Bán kèm và Bán lẻ nền xám', () => {
    const html = renderToStaticMarkup(
      <QuickActions shiftReady onCheckIn={noop} onSell={noop} onRetail={noop} />
    )

    expect(html).toContain('bg-text-primary text-text-inverse') // Check-in
    expect(html.match(/bg-surface-tertiary text-text-primary/g)).toHaveLength(2) // Bán kèm + Bán lẻ
  })

  it('Check-in nằm giữa Bán kèm và Bán lẻ', () => {
    const html = renderToStaticMarkup(
      <QuickActions shiftReady onCheckIn={noop} onSell={noop} onRetail={noop} />
    )

    expect(html.indexOf('Bán kèm')).toBeLessThan(html.indexOf('Check-in'))
    expect(html.indexOf('Check-in')).toBeLessThan(html.indexOf('Bán lẻ'))
  })

  // ── Hình dạng ô sau khi tách sang ActionTile ───────────────
  // Tách sang primitive không được đổi hình: 56px, nhãn một dòng, đệm ngang
  // 12px, chữ 12px — đúng bộ class của bản cũ trong `quick-actions.tsx`.
  it('giữ nguyên hình ô 56px của bản cũ sau khi tách sang ActionTile', () => {
    const html = renderToStaticMarkup(
      <QuickActions shiftReady onCheckIn={noop} onSell={noop} onRetail={noop} />
    )

    expect(html.match(/min-h-14/g)).toHaveLength(3)
    expect(html.match(/whitespace-nowrap/g)).toHaveLength(3)
    expect(html.match(/motion-press/g)).toHaveLength(3)
    for (const klass of ['px-3', 'text-xs', 'gap-1.5', 'rounded-lg']) {
      expect(html, klass).toContain(klass)
    }
  })

  it('ô bị khoá khi chưa có ca của chính mình', () => {
    const html = renderToStaticMarkup(
      <QuickActions shiftReady={false} onCheckIn={noop} onSell={noop} onRetail={noop} />
    )
    expect(html.match(/disabled/g)?.length).toBeGreaterThanOrEqual(3)
  })
})
