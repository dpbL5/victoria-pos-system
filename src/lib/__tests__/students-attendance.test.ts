import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/infrastructure/prisma', () => ({ prisma: {} }))

import { markAttendance } from '@/lib/students/use-cases/attendance'
import type { Repositories } from '@/lib/infrastructure/repositories'
import type { LessonRecord, LessonPackageRecord } from '@/lib/students'

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

function makePackage(overrides: Partial<LessonPackageRecord> = {}): LessonPackageRecord {
  return {
    id: 'pkg-1',
    studentId: 'stu-1',
    name: 'Gói 12 buổi',
    total: 12,
    used: 0,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

function setup(deps: Partial<Repositories>) {
  state.reposForTest = deps as Repositories
}

describe('markAttendance', () => {
  it('returns LESSON_NOT_FOUND when lesson missing', async () => {
    setup({
      lesson: {
        update: vi.fn(),
        findById: vi.fn(async () => null),
      } as never,
    })
    const result = await markAttendance(
      {
        staffId: 'staff-1',
        lessonId: 'lesson-x',
        version: 1,
        entries: [{ studentId: 'stu-1', status: 'COMPLETED' }],
      },
      state.reposForTest!
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('LESSON_NOT_FOUND')
  })

  it('rejects an entry for a student not in the lesson', async () => {
    setup({
      lesson: {
        update: vi.fn(),
        findById: vi.fn(async () => makeLesson()),
      } as never,
    })
    const result = await markAttendance(
      {
        staffId: 'staff-1',
        lessonId: 'lesson-1',
        version: 1,
        entries: [{ studentId: 'other-student', status: 'COMPLETED' }],
      },
      state.reposForTest!
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('LESSON_STUDENT_MISMATCH')
  })

  it('decrements package used exactly once when marking COMPLETED', async () => {
    let used = 0
    const lesson = makeLesson()
    const pkg = makePackage({ used: 0 })

    setup({
      lesson: {
        update: vi.fn(),
        findById: vi.fn(async () => lesson),
        upsertAttendance: vi.fn(async () => {}),
        setPackage: vi.fn(async () => {}),
      } as never,
      lessonPackage: {
        findActiveByStudent: vi.fn(async () => [pkg]),
        incrementUsed: vi.fn(async () => {
          used += 1
          return { ...pkg, used }
        }),
        findById: vi.fn(async () => ({ ...pkg, used })),
      } as never,
      audit: { append: vi.fn(async () => {}), findMany: vi.fn() } as never,
    })

    const result = await markAttendance(
      {
        staffId: 'staff-1',
        lessonId: 'lesson-1',
        version: 1,
        entries: [{ studentId: 'stu-1', status: 'COMPLETED' }],
      },
      state.reposForTest!
    )

    expect(result.ok).toBe(true)
    expect(used).toBe(1)
    if (result.ok) {
      expect(result.value.remainingByStudent['stu-1']).toBe(11)
    }
  })

  it('does not decrement when marking ABSENT', async () => {
    const incrementUsed = vi.fn(async () => makePackage({ used: 1 }))

    setup({
      lesson: {
        update: vi.fn(),
        findById: vi.fn(async () => makeLesson()),
        upsertAttendance: vi.fn(async () => {}),
        setPackage: vi.fn(async () => {}),
      } as never,
      lessonPackage: {
        findActiveByStudent: vi.fn(async () => [makePackage()]),
        incrementUsed,
        findById: vi.fn(async () => makePackage()),
      } as never,
      audit: { append: vi.fn(async () => {}), findMany: vi.fn() } as never,
    })

    const result = await markAttendance(
      {
        staffId: 'staff-1',
        lessonId: 'lesson-1',
        version: 1,
        entries: [{ studentId: 'stu-1', status: 'ABSENT' }],
      },
      state.reposForTest!
    )

    expect(result.ok).toBe(true)
    expect(incrementUsed).not.toHaveBeenCalled()
  })
})

function setupTransitions(overrides: Partial<LessonRecord> = {}) {
  const lesson = makeLesson({ startsAt: new Date(Date.now() - 7_200_000), ...overrides })
  const pkg = makePackage()
  setup({
    lesson: {
      findById: vi.fn(async () => lesson),
      update: vi.fn(async (_id, data, version) => {
        if (lesson.version !== version) throw new Error('Phiên bản sai trong test')
        Object.assign(lesson, data, { version: lesson.version + 1 })
        return lesson
      }),
      setPackage: vi.fn(async ({ packageId }) => { lesson.students[0].packageId = packageId }),
      upsertAttendance: vi.fn(async ({ status, note }) => {
        lesson.students[0].status = status
        if (note !== undefined) lesson.students[0].note = note
      }),
    } as Partial<Repositories['lesson']> as Repositories['lesson'],
    lessonPackage: {
      findActiveByStudent: vi.fn(async () => [pkg]),
      findById: vi.fn(async () => pkg),
      incrementUsed: vi.fn(async () => { pkg.used++; return pkg }),
      decrementUsed: vi.fn(async () => { pkg.used--; return pkg }),
    } as Partial<Repositories['lessonPackage']> as Repositories['lessonPackage'],
    audit: { append: vi.fn() } as never,
  })
  const mark = (status: 'COMPLETED' | 'ABSENT' | 'SCHEDULED', version = lesson.version) => markAttendance({
    staffId: 'admin', lessonId: lesson.id, version, entries: [{ studentId: 'stu-1', status }],
  }, state.reposForTest!)
  return { lesson, pkg, mark }
}

it('hoàn đúng gói khi sửa điểm danh và không trừ lần hai khi lưu lại', async () => {
  const { lesson, pkg, mark } = setupTransitions()
  expect((await mark('COMPLETED')).ok).toBe(true)
  expect(pkg.used).toBe(1)
  expect(lesson.students[0].packageId).toBe(pkg.id)
  expect((await mark('COMPLETED')).ok).toBe(true)
  expect(pkg.used).toBe(1)
  expect((await mark('ABSENT')).ok).toBe(true)
  expect(pkg.used).toBe(0)
  expect(lesson.students[0].packageId).toBeNull()
  expect((await mark('COMPLETED')).ok).toBe(true)
  expect(pkg.used).toBe(1)
  expect((await mark('SCHEDULED')).ok).toBe(true)
  expect(pkg.used).toBe(0)
  expect(lesson.status).toBe('SCHEDULED')
})

it('không trừ thêm với dữ liệu cũ ABSENT nhưng còn liên kết gói đã trừ', async () => {
  const { lesson, pkg, mark } = setupTransitions()
  lesson.students[0].status = 'ABSENT'
  lesson.students[0].packageId = pkg.id
  pkg.used = 1
  expect((await mark('COMPLETED')).ok).toBe(true)
  expect(pkg.used).toBe(1)
  expect(state.reposForTest!.lessonPackage.incrementUsed).not.toHaveBeenCalled()
})

it('chặn phiên bản cũ và buổi chưa kết thúc trước khi thay đổi gói', async () => {
  const { lesson, pkg, mark } = setupTransitions()
  expect(await mark('COMPLETED', 0)).toMatchObject({ ok: false, error: { code: 'LESSON_CONFLICT' } })
  lesson.startsAt = new Date()
  expect(await mark('COMPLETED')).toMatchObject({ ok: false, error: { code: 'LESSON_NOT_FINISHED' } })
  expect(pkg.used).toBe(0)
  expect(state.reposForTest!.lesson.upsertAttendance).not.toHaveBeenCalled()
})
