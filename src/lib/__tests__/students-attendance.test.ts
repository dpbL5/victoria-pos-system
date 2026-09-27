import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/infrastructure/prisma', () => ({ prisma: {} }))

import { markAttendance } from '@/lib/students/use-cases/attendance'
import type { Repositories } from '@/lib/infrastructure/repositories'
import type { LessonRecord } from '@/lib/students'

const state = vi.hoisted(() => ({ reposForTest: null as Repositories | null }))

vi.mock('@/lib/infrastructure/db-helpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/infrastructure/db-helpers')>()
  return {
    ...actual,
    runInTransaction: vi.fn(async (work: (repos: Repositories) => Promise<unknown>) => {
      try {
        const value = await work(state.reposForTest!)
        return { ok: true, value } as const
      } catch (error) {
        if (error instanceof actual.RollbackSignal) {
          return { ok: false, error: (error as { error: { code: string; detail?: string } }).error } as const
        }
        throw error
      }
    }),
  }
})

function makeLesson(): LessonRecord {
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
    students: [{
      id: 'ls-1',
      lessonId: 'lesson-1',
      studentId: 'stu-1',
      status: 'SCHEDULED',
      note: null,
      student: { id: 'stu-1', fullName: 'Nguyễn Văn A' } as never,
    }],
    series: null,
  } as LessonRecord
}

function setup(lesson = makeLesson()) {
  const lessonRepository = {
    findById: vi.fn(async () => lesson),
    update: vi.fn(async (_id: string, data: Parameters<Repositories['lesson']['update']>[1], version?: number) => {
      if (lesson.version !== version) throw new Error('Phiên bản sai trong test')
      Object.assign(lesson, data, { version: lesson.version + 1 })
      return lesson
    }),
    upsertAttendance: vi.fn(async ({ studentId, status, note }: Parameters<Repositories['lesson']['upsertAttendance']>[0]) => {
      const row = lesson.students.find(item => item.studentId === studentId)!
      row.status = status
      if (note !== undefined) row.note = note
    }),
  } as unknown as Repositories['lesson']
  state.reposForTest = {
    lesson: lessonRepository,
    audit: { append: vi.fn() } as never,
  } as unknown as Repositories
  const mark = (status: 'COMPLETED' | 'ABSENT' | 'SCHEDULED', version = lesson.version) => markAttendance({
    staffId: 'admin',
    lessonId: lesson.id,
    version,
    entries: [{ studentId: 'stu-1', status, note: 'Đã luyện tập tốt' }],
  }, state.reposForTest!)
  return { lesson, lessonRepository, mark }
}

describe('markAttendance', () => {
  it('từ chối học viên không thuộc buổi học', async () => {
    setup()
    const result = await markAttendance({
      staffId: 'admin',
      lessonId: 'lesson-1',
      version: 1,
      entries: [{ studentId: 'other-student', status: 'COMPLETED' }],
    }, state.reposForTest!)

    expect(result).toMatchObject({ ok: false, error: { code: 'LESSON_STUDENT_MISMATCH' } })
  })

  it('lưu trạng thái điểm danh và ghi chú học viên', async () => {
    const { lesson, lessonRepository, mark } = setup()
    const result = await mark('COMPLETED')

    expect(result).toMatchObject({ ok: true, value: { lesson: { status: 'COMPLETED' } } })
    expect(lesson.students[0]).toMatchObject({ status: 'COMPLETED', note: 'Đã luyện tập tốt' })
    expect(lessonRepository.upsertAttendance).toHaveBeenCalledTimes(1)
  })

  it('chặn phiên bản cũ và buổi chưa kết thúc trước khi ghi điểm danh', async () => {
    const { lesson, lessonRepository, mark } = setup()
    expect(await mark('COMPLETED', 0)).toMatchObject({ ok: false, error: { code: 'LESSON_CONFLICT' } })

    lesson.startsAt = new Date()
    expect(await mark('COMPLETED')).toMatchObject({ ok: false, error: { code: 'LESSON_NOT_FINISHED' } })
    expect(lessonRepository.upsertAttendance).not.toHaveBeenCalled()
  })
})
