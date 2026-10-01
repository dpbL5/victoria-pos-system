import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Logo } from './logo'

describe('Logo — mực theo theme app, không theo OS', () => {
  it('mọi path dùng currentColor và token, không hardcode hex', () => {
    const html = renderToStaticMarkup(<Logo className="h-20 w-20" />)
    expect(html.match(/fill="currentColor"/g)).toHaveLength(2)
    expect(html).toContain('text-text-primary')
    expect(html).toContain('text-yellow')
    expect(html).not.toMatch(/#[0-9a-f]{3,6}/i)
  })

  it('nhận className từ ngoài để đặt kích thước', () => {
    const html = renderToStaticMarkup(<Logo className="app-skeleton-logo h-20 w-20" />)
    expect(html).toContain('app-skeleton-logo')
    expect(html).toContain('h-20 w-20')
  })
})
