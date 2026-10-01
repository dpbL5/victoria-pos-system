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
})
