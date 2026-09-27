import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { StudentLessonNote } from './lesson-notes'

vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ success: () => {}, error: () => {} }) }))

it('học viên có note hiện nút sửa, chưa mở editor', () => {
  const html = renderToStaticMarkup(<StudentLessonNote lessonId="l1" version={1} studentId="s1" studentName="Nguyễn Văn A" note="Tiến bộ tốt" />)

  expect(html).toContain('Ghi chú')
  expect(html).not.toContain('<textarea')
})
