import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { Trash2 } from 'lucide-react'
import { Button, buttonClass } from './button'

describe('Button — bộ accent Blue/Red/Yellow/White', () => {
  const accentCases = [
    ['blue', 'bg-info'],
    ['red', 'bg-danger'],
    ['red-soft', 'bg-danger-bg'],
    ['success', 'bg-success-bg'],
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

  it('mọi variant cùng chiều cao: variant nào cũng có đúng 1px viền', () => {
    // Thiếu viền thì nút thấp hơn 2px — hai nút khác màu đứng cạnh nhau sẽ lệch
    // (đo thật: Hủy/red-soft 30px cạnh Xác nhận/contrast 28px).
    for (const [variant] of accentCases) {
      const html = renderToStaticMarkup(<Button variant={variant}>Lưu</Button>)
      expect(html, variant).toMatch(/border border-(transparent|danger|success|border)/)
    }
  })
})

// ── Quy ước chọn variant toàn hệ thống ─────────────────────
// `variant` mặc định là `blue`, nên quên truyền = một nút hành động chính bị
// tô nhầm màu brand mà không ai thấy lúc review. Test này khoá lại: MỌI
// `<Button>` phải khai báo variant tường minh (chuỗi hoặc biểu thức điều kiện).
const ROOT = process.cwd()

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (entry.name.endsWith('.tsx')) out.push(full)
  }
  return out
}

/** Quét tới `>` ở depth 0 — `onClick={() => …}` có `>` bên trong ngoặc. */
function tagFrom(source: string, start: number): string {
  const open: string[] = []
  let quote: string | null = null
  for (let i = start; i < source.length; i++) {
    const ch = source[i]
    if (quote) {
      if (ch === '\\') i++
      else if (ch === quote) quote = null
    } else if (ch === '"' || ch === "'" || ch === '`') quote = ch
    else if (ch === '{' || ch === '(' || ch === '[') open.push(ch)
    else if (ch === '}' || ch === ')' || ch === ']') open.pop()
    else if (ch === '>' && open.length === 0) return source.slice(start, i + 1)
  }
  return source.slice(start, start + 400)
}

describe('quy ước variant của Button', () => {
  const offenders: string[] = []
  for (const file of walk(join(ROOT, 'src'))) {
    if (file.includes('.test.')) continue
    const source = readFileSync(file, 'utf8')
    for (const match of source.matchAll(/<Button\b/g)) {
      const tag = tagFrom(source, match.index)
      if (!/variant\s*=/.test(tag)) {
        const line = source.slice(0, match.index).split('\n').length
        offenders.push(`${file.slice(ROOT.length + 1)}:${line}  ${tag.replace(/\s+/g, ' ').slice(0, 80)}`)
      }
    }
  }

  it('mọi <Button> đều khai báo variant tường minh', () => {
    expect(offenders, 'Thêm variant theo vai trò: hành động chính = contrast, phụ = white, xoá = red').toEqual([])
  })
})
