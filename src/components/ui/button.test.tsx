import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Trash2 } from 'lucide-react'
import { Button, buttonClass } from './button'

describe('Button — bộ accent Blue/Red/Yellow/White', () => {
 const accentCases = [
 ['blue', 'bg-info'],
 ['red', 'bg-danger'],
 ['red-soft', 'bg-danger-bg'],
 ['yellow', 'bg-yellow'],
 ['white', 'bg-surface-elevated'],
 ['grey', 'bg-surface-tertiary'],
 ['contrast', 'bg-text-primary'],
 ['ghost', 'text-text-tertiary'],
 ] as const

 it.each(accentCases)('variant %s dùng token %s', (variant, token) => {
 expect(renderToStaticMarkup(<Button variant={variant}>Lưu</Button>)).toContain(token)
 })

 it('mặc định là blue', () => {
 expect(renderToStaticMarkup(<Button>Lưu</Button>)).toContain(buttonClass({ variant: 'blue' }))
 })

 it('nút xoá có chữ dùng red, bản icon trong bảng dùng red-soft', () => {
 expect(renderToStaticMarkup(<Button variant="red">Xoá</Button>)).toContain(buttonClass({ variant: 'red' }))
 const iconOnly = renderToStaticMarkup(<Button variant="red-soft" icon={Trash2} title="Xoá" />)
 expect(iconOnly).toContain(buttonClass({ variant: 'red-soft', iconOnly: true }))
 })

 it('mọi accent đều có trạng thái disabled và focus ring', () => {
 for (const [variant] of accentCases) {
 const html = renderToStaticMarkup(<Button variant={variant}>Lưu</Button>)
 expect(html).toContain('disabled:opacity-50')
 expect(html).toContain('focus-visible:ring-focus-ring')
 }
 })
})
