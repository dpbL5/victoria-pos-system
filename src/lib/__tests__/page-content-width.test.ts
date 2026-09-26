import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// ── Bề rộng nội dung dùng chung ───────────────────────────
// Mọi trang dashboard phải dùng class `max-w-content` (token --container-content
// trong src/app/globals.css). Không hardcode max-w-3xl/4xl/5xl/6xl trong trang:
// mỗi trang một width sẽ làm nội dung nhảy qua lại khi điều hướng.
// Đổi bề rộng toàn app = sửa 1 dòng token trong globals.css.

const ROOT = process.cwd()
const FORBIDDEN_WIDTH = /max-w-(3xl|4xl|5xl|6xl|7xl)\b/g
const CONTENT_WIDTH_CLASS = 'max-w-content'

// Ngoại lệ có chủ đích: Lịch học render FullCalendar full-bleed (bảng lịch cần
// toàn bộ bề ngang), không phải trang nội dung dạng cột.
const FULL_BLEED_SCREENS = ['src/features/students/lessons-screen.tsx']

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else out.push(full)
  }
  return out
}

function relativeToRoot(files: string[]): string[] {
  return files.map((file) => file.slice(ROOT.length + 1))
}

const pageFiles = relativeToRoot([
  ...walk(join(ROOT, 'src/features')),
  ...walk(join(ROOT, 'src/app/(dashboard)')),
]).filter((file) => /-screen\.tsx$/.test(file) || /page\.tsx$/.test(file))

const screenFiles = pageFiles.filter((file) => /-screen\.tsx$/.test(file))

function read(file: string): string {
  return readFileSync(join(ROOT, file), 'utf8')
}

describe('bề rộng nội dung trang', () => {
  it('không trang nào hardcode max-w-3xl/4xl/5xl/6xl', () => {
    const offenders = pageFiles.filter((file) => FORBIDDEN_WIDTH.test(read(file)))
    expect(
      offenders,
      'Dùng `max-w-content` (token --container-content trong src/app/globals.css) thay vì max-w-5xl…',
    ).toEqual([])
  })

  it('mọi screen đều dùng max-w-content', () => {
    const missing = screenFiles.filter(
      (file) =>
        !FULL_BLEED_SCREENS.includes(file) && !read(file).includes(CONTENT_WIDTH_CLASS),
    )
    expect(
      missing,
      'Screen phải bọc nội dung trong `<div className="mx-auto max-w-content space-y-4">`',
    ).toEqual([])
  })

  it('token --container-content tồn tại trong globals.css', () => {
    const css = read('src/app/globals.css')
    expect(css).toContain('--container-content:')
  })
})
