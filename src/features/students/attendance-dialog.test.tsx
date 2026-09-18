import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { AttendanceDialog } from './attendance-dialog'
import type { Lesson, LessonStudent } from './types'

vi.mock('@/hooks/use-api', () => ({
  useApi: () => ({
    data: {
      success: true,
      data: { notes: [{ studentId: 's1', note: 'Cần siết tay trái', startsAt: '2026-09-03T11:00:00Z', lessonTitle: 'Buổi 2' }] },
    },
  }),
}))
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ success: () => {}, error: () => {} }) }))

const member = (studentId: string, fullName: string): LessonStudent => ({
  id: `ls-${studentId}`,
  lessonId: 'l1',
  studentId,
  status: 'SCHEDULED',
  note: null,
  packageId: null,
  student: { id: studentId, fullName },
  package: null,
})

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
  students: [member('s1', 'Nguyễn Văn A'), member('s2', 'Trần Thị B')],
}

it('hiển thị bảng học viên và note buổi trước của từng học viên', () => {
  const html = renderToStaticMarkup(<AttendanceDialog lesson={lesson} onClose={() => {}} onSaved={() => {}} />)

  expect(html).toContain('Nguyễn Văn A')
  expect(html).toContain('Trần Thị B')
  expect(html).toContain('Buổi trước 03/09')
  expect(html).toContain('Cần siết tay trái')
  expect(html.match(/Buổi trước/g)).toHaveLength(1)
})
