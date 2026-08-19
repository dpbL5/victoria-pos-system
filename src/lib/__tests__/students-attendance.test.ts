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
    seriesId: null,
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
        findById: vi.fn(async () => null),
      } as never,
    })
    const result = await markAttendance(
      {
        staffId: 'staff-1',
        lessonId: 'lesson-x',
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
        findById: vi.fn(async () => makeLesson()),
      } as never,
    })
    const result = await markAttendance(
      {
        staffId: 'staff-1',
        lessonId: 'lesson-1',
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
        entries: [{ studentId: 'stu-1', status: 'ABSENT' }],
      },
      state.reposForTest!
    )

    expect(result.ok).toBe(true)
    expect(incrementUsed).not.toHaveBeenCalled()
  })
})
