import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { LessonEditor } from './lesson-editor'
import type { Lesson } from './types'

vi.mock('@/hooks/use-api', () => ({ useApi: () => ({}) }))
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ success: () => {}, error: () => {} }) }))

const lesson: Lesson = {
  id: 'l1',
  version: 1,
  originalStartAt: null,
  shareNote: false,
  isException: false,
  series: null,
  seriesId: null,
  class: null,
  title: 'Lớp cung cơ bản',
  coachName: null,
  startsAt: '2026-09-10T11:00:00Z',
  durationMin: 60,
  status: 'SCHEDULED',
  note: null,
  googleEventId: null,
  students: [
    { id: 'ls-1', lessonId: 'l1', studentId: 's1', status: 'SCHEDULED', note: null, student: { id: 's1', fullName: 'Nguyễn Văn A' } },
  ],
}

const render = (target: Lesson) =>
  renderToStaticMarkup(
    <LessonEditor lesson={target} start={target.startsAt} end="2026-09-10T12:00:00Z" onClose={() => {}} onSaved={() => {}} />
  )

it('mở được điểm danh từ chi tiết buổi học', () => {
  expect(render(lesson)).toContain('Điểm danh')
})

it('buổi đã huỷ không hiện nút điểm danh', () => {
  expect(render({ ...lesson, status: 'CANCELLED' })).not.toContain('Điểm danh')
})

it('buổi đã lưu hiện mục ghi chú từng học viên', () => {
  const html = render({ ...lesson, students: [{ ...lesson.students[0], note: 'Tiến bộ tốt' }] })

  expect(html).toContain('Ghi chú cho Nguyễn Văn A')
  expect(html).toContain('Nguyễn Văn A')
  expect(html).toContain('Tiến bộ tốt')
})

it('buổi đã huỷ không hiện mục ghi chú từng học viên', () => {
  expect(render({ ...lesson, status: 'CANCELLED' })).not.toContain('Ghi chú cho Nguyễn Văn A')
})
