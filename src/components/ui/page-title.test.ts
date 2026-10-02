import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PAGE_TITLE_CLASS } from './page-title'

// ── Một cỡ duy nhất cho tiêu đề trang ──────────────────────────────────────
// DESIGN.md → Typography → Headline: 20px/28px/700/+0.025em là cỡ của "tiêu đề
// màn hình trên mobile (header dán trên cùng) VÀ tên màn". Trước đây desktop có
// 4 cỡ khác nhau (24px ở 14 màn, 20px ở 2 màn, 18px và 16px ở màn chi tiết)
// trong khi mobile mọi màn đều 20px — cùng một tiêu đề mà hai cỡ tuỳ bề rộng.
//
// Test này khoá lại: mọi `h1` tiêu đề trang phải dùng `PAGE_TITLE_CLASS`.
//
// Ngoại lệ có chủ đích — chữ VICTORIA là WORDMARK thương hiệu, không phải tên
// màn: sidebar (khoá lockup với logo) và trang login (thẻ đăng nhập riêng, không
// thuộc dashboard). Cỡ chữ của wordmark do nhận diện quyết định, không theo
// thang tiêu đề màn.
const ROOT = process.cwd()
// `src/app` phải nằm trong phạm vi quét: trang Nhân viên từng có h1 riêng
// (text-2xl + palette thô) vì thư mục này không nằm trong danh sách cũ.
const SCAN_DIRS = ['src/features', 'src/components/layout', 'src/app']
const WORDMARK_FILES = ['src/components/layout/sidebar.tsx', 'src/app/(auth)/login/page.tsx']
const H1_OPEN_TAG = /<h1\b[^>]*>/g
const FORBIDDEN_IN_TITLE = /text-2xl|text-lg|text-base|text-zinc-|text-slate-|text-gray-/

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const relative = join(dir, entry.name)
    if (entry.isDirectory()) walk(relative, out)
    else if (/\.tsx$/.test(entry.name)) out.push(relative)
  }
  return out
}

function titleTagsOf(file: string): string[] {
  return readFileSync(join(ROOT, file), 'utf8').match(H1_OPEN_TAG) ?? []
}

describe('tiêu đề trang', () => {
  const files = SCAN_DIRS
    .flatMap((dir) => walk(dir))
    .filter((file) => !WORDMARK_FILES.includes(file))
  const withTitles = files.filter((file) => titleTagsOf(file).length > 0)

  it('có ít nhất một trang dùng tiêu đề chung (test không được rỗng nghĩa)', () => {
    expect(withTitles.length).toBeGreaterThan(10)
  })

  it('mọi h1 dùng PAGE_TITLE_CLASS', () => {
    const offenders = withTitles.flatMap((file) =>
      titleTagsOf(file)
        .filter((tag) => !tag.includes('PAGE_TITLE_CLASS'))
        .map((tag) => `${file}: ${tag}`)
    )

    expect(offenders).toEqual([])
  })

  it('không hardcode cỡ chữ / màu palette trong h1', () => {
    const offenders = withTitles.flatMap((file) =>
      titleTagsOf(file)
        .filter((tag) => FORBIDDEN_IN_TITLE.test(tag))
        .map((tag) => `${file}: ${tag}`)
    )

    expect(offenders).toEqual([])
  })

  it('PAGE_TITLE_CLASS giữ đúng cỡ Headline của DESIGN.md, không phải cỡ Display', () => {
    expect(PAGE_TITLE_CLASS).toContain('text-xl')
    expect(PAGE_TITLE_CLASS).toContain('text-text-primary')
    expect(PAGE_TITLE_CLASS).not.toContain('text-2xl')
  })
})
