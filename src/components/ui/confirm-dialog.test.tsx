import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ConfirmDialog } from './confirm-dialog'

describe('ConfirmDialog', () => {
  it('đặt mô tả trong body, header chỉ giữ tiêu đề', () => {
    const html = renderToStaticMarkup(
      <ConfirmDialog
        open
        title="Xoá lớp học?"
        description="Xoá vĩnh viễn lớp A và toàn bộ buổi học"
        onClose={() => {}}
        onConfirm={() => {}}
      />
    )
    const bodyIndex = html.indexOf('flex-1 overflow-y-auto')
    expect(bodyIndex).toBeGreaterThan(-1)
    // Tiêu đề nằm trong header (trước body), mô tả nằm trong body (sau body).
    expect(html.indexOf('Xoá lớp học?')).toBeLessThan(bodyIndex)
    expect(html.indexOf('Xoá vĩnh viễn lớp A và toàn bộ buổi học')).toBeGreaterThan(bodyIndex)
  })

  it('body chỉ chứa mô tả khi không truyền nội dung riêng', () => {
    const html = renderToStaticMarkup(
      <ConfirmDialog open title="Xác nhận" onClose={() => {}} onConfirm={() => {}} body={<span>Chi tiết phụ</span>} />
    )
    const bodyIndex = html.indexOf('flex-1 overflow-y-auto')
    expect(html.indexOf('Chi tiết phụ')).toBeGreaterThan(bodyIndex)
  })
})
