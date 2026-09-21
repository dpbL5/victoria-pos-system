import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/infrastructure/prisma', () => ({ prisma: {} }))

import { updateLessonStudentNotes } from '@/lib/students/use-cases/attendance'
import type { Repositories } from '@/lib/infrastructure/repositories'
import type { LessonRecord } from '@/lib/students'

// Container cho fake repos — mock factory đọc qua getter để tránh hoisting
const state = vi.hoisted(() => ({
  reposForTest: null as Repositories | null,
}))

vi.mock('@/lib/infrastructure/db-helpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/infrastructure/db-helpers')>()
  return {
    ...actual,
    runInTransaction: vi.fn(async (work: (repos: Repositories) => Promise<unknown>) => {
      try {
        const value = await work(state.reposForTest!)
        return { ok: true, value } as const
      } catch (e) {
        if (e instanceof actual.RollbackSignal) {
          return { ok: false, error: (e as { error: { code: string; detail?: string } }).error } as const
        }
        throw e
      }
    }),
  }
})

function makeLesson(overrides: Partial<LessonRecord> = {}): LessonRecord {
  return {
    id: 'lesson-1',
    version: 1,
    originalStartAt: null,
    isException: false,
    shareNote: false,
    googleCalendarId: null,
    seriesId: null,
    classId: null,
    class: null,
    title: 'Buổi 1',
    coachName: null,
    startsAt: new Date('2026-08-17T11:00:00Z'),
    durationMin: 60,
    status: 'SCHEDULED',
    note: null,
    googleEventId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    students: [
      {
        id: 'ls-1',
        lessonId: 'lesson-1',
        studentId: 'stu-1',
        status: 'SCHEDULED',
        note: null,
        packageId: null,
        student: { id: 'stu-1', fullName: 'Nguyễn Văn A' } as never,
        package: null,
      },
    ],
    series: null,
    ...overrides,
  }
}

function setupLesson(overrides: Partial<Repositories['lesson']> = {}) {
  const setStudentNote = vi.fn(async () => {})
  const auditCalls: { action: string; entityId: string; details?: unknown }[] = []
  setup({
    lesson: {
      findById: vi.fn(async () => makeLesson()),
      setStudentNote,
      ...overrides,
    } as never,
    audit: { append: vi.fn(async (payload: { action: string; entityId: string; details?: unknown }) => { auditCalls.push(payload) }), findMany: vi.fn() } as never,
  })
  return { setStudentNote, auditCalls }
}

function setup(deps: Partial<Repositories>) {
  state.reposForTest = deps as Repositories
}

describe('updateLessonStudentNotes', () => {
  it('trả LESSON_NOT_FOUND khi không có buổi học', async () => {
    setup({ lesson: { findById: vi.fn(async () => null) } as never })

    const result = await updateLessonStudentNotes(
      { staffId: 'staff-1', lessonId: 'lesson-x', entries: [{ studentId: 'stu-1', note: 'ok' }] },
      state.reposForTest!
    )

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('LESSON_NOT_FOUND')
  })

  it('từ chối học viên không thuộc buổi', async () => {
    setup({ lesson: { findById: vi.fn(async () => makeLesson()) } as never })

    const result = await updateLessonStudentNotes(
      { staffId: 'staff-1', lessonId: 'lesson-1', entries: [{ studentId: 'other', note: 'ok' }] },
      state.reposForTest!
    )

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('LESSON_STUDENT_MISMATCH')
  })

  it('chặn buổi đã huỷ', async () => {
    setupLesson({
      findById: vi.fn(async () => makeLesson({ status: 'CANCELLED' })),
    })

    const result = await updateLessonStudentNotes(
      { staffId: 'staff-1', lessonId: 'lesson-1', entries: [{ studentId: 'stu-1', note: 'ok' }] },
      state.reposForTest!
    )

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('LESSON_CANCELLED')
  })

  it('ghi note đã trim và ghi audit không kèm nội dung note', async () => {
    const { setStudentNote, auditCalls } = setupLesson()

    const result = await updateLessonStudentNotes(
      { staffId: 'staff-1', lessonId: 'lesson-1', entries: [{ studentId: 'stu-1', note: '  Tiến bộ tốt  ' }] },
      state.reposForTest!
    )

    expect(result.ok).toBe(true)
    expect(setStudentNote).toHaveBeenCalledWith({ lessonId: 'lesson-1', studentId: 'stu-1', note: 'Tiến bộ tốt' })

    expect(auditCalls).toHaveLength(1)
    expect(auditCalls[0].action).toBe('LESSON_STUDENT_NOTE')
    expect(JSON.stringify(auditCalls[0].details)).not.toContain('Tiến bộ tốt')
  })

  it('note rỗng xoá note (null)', async () => {
    const { setStudentNote } = setupLesson()

    const result = await updateLessonStudentNotes(
      { staffId: 'staff-1', lessonId: 'lesson-1', entries: [{ studentId: 'stu-1', note: '   ' }] },
      state.reposForTest!
    )

    expect(result.ok).toBe(true)
    expect(setStudentNote).toHaveBeenCalledWith({ lessonId: 'lesson-1', studentId: 'stu-1', note: null })
  })

  it('ghi được note cho buổi chưa diễn ra (SCHEDULED)', async () => {
    const { setStudentNote } = setupLesson({
      findById: vi.fn(async () => makeLesson({ status: 'SCHEDULED' })),
    })

    const result = await updateLessonStudentNotes(
      { staffId: 'staff-1', lessonId: 'lesson-1', entries: [{ studentId: 'stu-1', note: 'Dặn mang cung' }] },
      state.reposForTest!
    )

    expect(result.ok).toBe(true)
    expect(setStudentNote).toHaveBeenCalledTimes(1)
  })
})
