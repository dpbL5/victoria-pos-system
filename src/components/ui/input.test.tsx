import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { Input, Select } from './input'

const selectHtml = renderToStaticMarkup(
  <Select aria-label="Trạng thái">
    <option value="">Tất cả</option>
  </Select>
)
const inputHtml = renderToStaticMarkup(<Input aria-label="Tìm" />)

describe('Select — cùng khuôn với Input, mũi tên của hệ design', () => {
  it('bỏ mũi tên của hệ điều hành', () => {
    // Không có `appearance-none` thì Chrome vẽ glyph đặc của OS đè lên, đồng thời
    // UA ép `line-height: normal` → cao 41px cạnh Input 42px (đo ở 390px).
    expect(selectHtml).toContain('appearance-none')
  })

  it('vẽ mũi tên bằng icon lucide, không phải glyph', () => {
    expect(selectHtml).toContain('<svg')
    expect(selectHtml).toContain('aria-hidden="true"')
    expect(selectHtml).toContain('pointer-events-none')
    expect(selectHtml).toContain('text-text-tertiary')
  })

  it('chừa chỗ cho mũi tên ở mép phải', () => {
    expect(selectHtml).toContain('pr-9')
  })

  it('mũi tên nằm trong khung bọc full width, nên bố cục form không đổi', () => {
    expect(selectHtml).toMatch(/class="relative w-full"/)
    // `peer` để mũi tên mờ theo trạng thái disabled của select.
    expect(selectHtml).toContain('peer')
    expect(selectHtml).toContain('peer-disabled:opacity-50')
  })

  it('ô nhập và select dùng chung khuôn: viền strong, bo 12px, cùng cỡ chữ', () => {
    for (const token of ['border-border-strong', 'rounded-lg', 'px-3', 'py-2', 'text-base', 'sm:text-sm', 'focus:ring-focus-ring', 'disabled:opacity-50']) {
      expect(inputHtml, token).toContain(token)
      expect(selectHtml, token).toContain(token)
    }
  })
})

// ── Quy ước dùng <Select> toàn hệ thống ───────────────────
// <Select> render ra khung `relative` bọc ngoài + mũi tên ở mép phải khung, nên
// `className` truyền vào chỉ nên nói về chữ/màu/viền của chính control. Ba nhóm
// class về HÌNH HỘP sẽ hỏng LẶNG LẼ (không lỗi build, không lỗi type):
//  · bề rộng (`w-*`/`max-w-*`) và tham gia flex (`flex-1`, `min-w-0`, `basis-*`,
//    `self-*`): khung bọc mới là flex item, class đặt ở select là vô hiệu —
//    đặt cho khung bọc.
//  · đệm phải (`pr-<số>` / `px-<số>`): Tailwind sắp utility cùng thang theo thang
//    giá trị chứ không theo thứ tự class, nên `pr-7` LUÔN thua `pr-9` của
//    primitive. Cần khe hẹp hơn thì dùng giá trị arbitrary (`pr-[1.75rem]`).
const ROOT = process.cwd()

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (entry.name.endsWith('.tsx')) out.push(full)
  }
  return out
}

/** Quét tới `>` ở depth 0 — `onChange={() => …}` có `>` bên trong ngoặc. */
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

const RULES: Array<{ pattern: RegExp; hint: string }> = [
  {
    pattern: /(^|\s)(max-w-|w-|flex-(1|auto|initial|none)\b|grow\b|basis-|self-|min-w-)/,
    hint: 'hình hộp (bề rộng / flex) phải đặt cho khung bọc, không đặt cho <Select>',
  },
  { pattern: /(^|\s)pr-\d/, hint: 'khe phải: `pr-7` thua `pr-9` của primitive — dùng `pr-[1.75rem]`' },
  { pattern: /(^|\s)px-\d/, hint: '`px-*` bị `pr-9` ghi đè phần phải — tách thành `pl-*` + khe riêng' },
]

describe('quy ước className của Select', () => {
  const offenders: string[] = []
  for (const file of walk(join(ROOT, 'src'))) {
    if (file.includes('.test.')) continue
    const source = readFileSync(file, 'utf8')
    for (const match of source.matchAll(/<Select\b/g)) {
      const tag = tagFrom(source, match.index)
      const className = tag.match(/className="([^"]*)"/)?.[1]
      if (!className) continue
      for (const { pattern, hint } of RULES) {
        if (pattern.test(className)) {
          const line = source.slice(0, match.index).split('\n').length
          offenders.push(`${file.slice(ROOT.length + 1)}:${line}  "${className}" → ${hint}`)
        }
      }
    }
  }

  it('className không đụng vào bề rộng và đệm phải của select', () => {
    expect(offenders, 'Xem ghi chú ở đầu input.tsx').toEqual([])
  })
})
