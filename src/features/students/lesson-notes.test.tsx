import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { LessonStudentNotes, StudentLessonNote } from './lesson-notes'

vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ success: () => {}, error: () => {} }) }))

const students = [
  { studentId: 's1', fullName: 'Nguyễn Văn A', note: 'Tiến bộ tốt' },
  { studentId: 's2', fullName: 'Trần Thị B', note: null },
]

it('liệt kê mọi học viên kèm note hiện có', () => {
  const html = renderToStaticMarkup(<LessonStudentNotes lessonId="l1" version={1} students={students} />)

  expect(html).toContain('Ghi chú từng học viên')
  expect(html).toContain('Nguyễn Văn A')
  expect(html).toContain('Trần Thị B')
  expect(html).toContain('Tiến bộ tốt')
})

it('nút lưu tắt khi chưa có thay đổi', () => {
  const html = renderToStaticMarkup(<LessonStudentNotes lessonId="l1" version={1} students={students} />)

  expect(html).toContain('Lưu ghi chú')
  expect(html).toContain('disabled')
})

it('học viên có note hiện nút sửa, chưa mở editor', () => {
  const html = renderToStaticMarkup(<StudentLessonNote lessonId="l1" version={1} studentId="s1" studentName="Nguyễn Văn A" note="Tiến bộ tốt" />)

  expect(html).toContain('Ghi chú')
  expect(html).not.toContain('<textarea')
})
