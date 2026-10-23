import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// ── Guard class token không tồn tại ───────────────────────
// `bg-success-bg0`/`bg-warning-bg0` từng xuất hiện ở 5 chỗ nhưng Tailwind
// không bao giờ sinh CSS cho chúng (token thật là `--color-success-bg`),
// khiến thanh accent và dot trạng thái vô hình. Chặn tái phát ở mức grep.

const ROOT = process.cwd()
const INVALID_TOKEN_CLASS = /-bg0\b/

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else out.push(full)
  }
  return out
}

const sourceFiles = walk(join(ROOT, 'src')).filter((file) => file.endsWith('.tsx'))

describe('class token hợp lệ', () => {
  it('không còn class *-bg0 (token không tồn tại)', () => {
    const offenders = sourceFiles
      .filter((file) => INVALID_TOKEN_CLASS.test(readFileSync(file, 'utf8')))
      .map((file) => file.slice(ROOT.length + 1))

    expect(
      offenders,
      'Dùng `bg-success-bg` / `bg-warning-bg` hoặc màu đặc `bg-success` / `bg-warning`; hậu tố 0 không có trong token.',
    ).toEqual([])
  })
})
