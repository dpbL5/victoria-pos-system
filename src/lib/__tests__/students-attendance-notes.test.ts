import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/infrastructure/prisma', () => ({ prisma: {} }))

import { latestNotesPerStudent, previousAttendanceNotes } from '@/lib/students'
import type { Repositories } from '@/lib/infrastructure/repositories'

const row = (studentId: string, note: string | null, startsAt: string, lessonTitle = 'Buổi học') => ({
  studentId,
  note,
  lesson: { startsAt: new Date(startsAt), title: lessonTitle },
})

describe('latestNotesPerStudent', () => {
  it('giữ note buổi gần nhất của mỗi học viên, bỏ qua note rỗng', () => {
    const notes = latestNotesPerStudent([
      row('a', 'Buổi 3: tay trái khoẻ hơn', '2026-09-10T11:00:00Z'),
      row('a', 'Buổi 2 của A', '2026-09-03T11:00:00Z'),
      row('b', '   ', '2026-09-10T11:00:00Z'),
      row('b', 'Buổi 2 của B', '2026-09-03T11:00:00Z'),
      row('c', null, '2026-09-10T11:00:00Z'),
    ])

    expect(notes).toEqual([
      { studentId: 'a', note: 'Buổi 3: tay trái khoẻ hơn', startsAt: new Date('2026-09-10T11:00:00Z'), lessonTitle: 'Buổi học' },
      { studentId: 'b', note: 'Buổi 2 của B', startsAt: new Date('2026-09-03T11:00:00Z'), lessonTitle: 'Buổi học' },
    ])
  })
})

describe('previousAttendanceNotes', () => {
  it('lấy note trước buổi học cho đúng học viên của buổi', async () => {
    const startsAt = new Date('2026-09-10T11:00:00Z')
    const lesson = { findById: vi.fn(async () => ({ id: 'l1', startsAt, students: [{ studentId: 'a' }, { studentId: 'b' }] })) }
    const lastNotesByStudent = vi.fn(async () => [
      { studentId: 'a', note: 'Buổi trước của A', startsAt: new Date('2026-09-03T11:00:00Z'), lessonTitle: 'Buổi 2' },
    ])

    const result = await previousAttendanceNotes({ lessonId: 'l1' }, { lesson: { ...lesson, lastNotesByStudent } } as unknown as Repositories)

    expect(lastNotesByStudent).toHaveBeenCalledWith(['a', 'b'], startsAt)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.notes).toHaveLength(1)
  })

  it('trả LESSON_NOT_FOUND khi buổi học không tồn tại', async () => {
    const result = await previousAttendanceNotes(
      { lessonId: 'missing' },
      { lesson: { findById: vi.fn(async () => null) } } as unknown as Repositories
    )

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('LESSON_NOT_FOUND')
  })
})
