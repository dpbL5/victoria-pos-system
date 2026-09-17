import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LessonClassRecord, LessonRecord, LessonSeriesRecord, CalendarSyncJobRecord } from '@/lib/students/ports'
import type { Repositories } from '@/lib/infrastructure/repositories'

vi.mock('@/lib/infrastructure/prisma', () => ({ prisma: {} }))
const state = vi.hoisted(() => ({
  lessons: [] as LessonRecord[],
  series: [] as LessonSeriesRecord[],
  classes: [] as LessonClassRecord[],
  jobs: [] as CalendarSyncJobRecord[],
  repos: null as unknown as Repositories,
}))
vi.mock('@/lib/infrastructure/db-helpers', async original => {
  const actual = await original<typeof import('@/lib/infrastructure/db-helpers')>()
  return {
    ...actual,
    runInTransaction: vi.fn(async (work: (repos: Repositories) => Promise<unknown>) => {
      const before = structuredClone({ lessons: state.lessons, series: state.series, classes: state.classes, jobs: state.jobs })
      try {
        return { ok: true, value: await work(state.repos) }
      } catch (error) {
        Object.assign(state, before)
        if (error instanceof actual.RollbackSignal) return { ok: false, error: error.error }
        throw error
      }
    }),
  }
})
import { addClassStudent, createClass, createClassSlot, createSeries, deleteClass, removeClassStudent, setClassRoster, updateClass, updateClassSlot, updateSeries, type ClassSlotInput } from '@/lib/students'
import { fail } from '@/lib/infrastructure/db-helpers'

const DAY_MS = 86_400_000
const member = (studentId: string) => ({ id: `ls-${studentId}`, lessonId: '', studentId, status: 'SCHEDULED' as const, note: null, packageId: null, package: null, student: { id: studentId, fullName: studentId } })

/** Ngày bắt đầu ở tương lai, đúng thứ của `day` (0=CN). */
function futureOn(day: number, weeksAhead = 6) {
  const date = new Date(Date.now() + weeksAhead * 7 * DAY_MS)
  date.setUTCHours(0, 0, 0, 0)
  date.setUTCDate(date.getUTCDate() + ((day - date.getUTCDay() + 7) % 7))
  return date
}

const slot = (day: number, startTime: string, durationMin = 60): ClassSlotInput => ({
  daysOfWeek: [day],
  startTime,
  durationMin,
  startsOn: futureOn(day),
})

/** Bản ghi lớp luôn tính slots/_count từ state để phản ánh thay đổi của chuỗi. */
function classRecord(item: LessonClassRecord): LessonClassRecord {
  const slots = state.series.filter(series => series.classId === item.id)
  const lessonCount = state.lessons.filter(lesson => lesson.classId === item.id || slots.some(series => series.id === lesson.seriesId)).length
  return {
    ...item,
    slots: slots.map(series => ({
      ...series,
      students: series.students.map(row => ({ studentId: row.studentId, student: { id: row.studentId, fullName: row.studentId, phone: null } })),
    })),
    _count: { lessons: lessonCount },
  } as unknown as LessonClassRecord
}

beforeEach(() => {
  state.lessons = []; state.series = []; state.classes = []; state.jobs = []
  state.repos = {
    student: { findById: vi.fn(async (id: string) => ({ id, status: 'ACTIVE', deletedAt: null })) },
    lessonClass: {
      findMany: vi.fn(async () => state.classes.map(classRecord)),
      findById: vi.fn(async (id: string) => {
        const found = state.classes.find(item => item.id === id)
        return found ? classRecord(found) : null
      }),
      create: vi.fn(async (data: { name: string; coachName?: string | null; note?: string | null }) => {
        const item = { id: crypto.randomUUID(), isActive: true, note: null, coachName: null, createdAt: new Date(), updatedAt: new Date(), ...data } as unknown as LessonClassRecord
        state.classes.push(item)
        return classRecord(item)
      }),
      update: vi.fn(async (id: string, data: object) => {
        const item = state.classes.find(row => row.id === id)!
        Object.assign(item, data)
        return classRecord(item)
      }),
      delete: vi.fn(async (id: string) => { state.classes = state.classes.filter(row => row.id !== id) }),
      findUpcomingLessons: vi.fn(async (ids: string[]) => state.lessons.filter(lesson => lesson.startsAt >= new Date() && (ids.includes(lesson.classId ?? '') || ids.includes(state.series.find(series => series.id === lesson.seriesId)?.classId ?? '')))),
      classesOfStudents: vi.fn(async (studentIds: string[]) => {
        const rows: { studentId: string; studentName: string; classId: string; className: string }[] = []
        for (const item of state.classes) {
          for (const series of state.series.filter(row => row.classId === item.id)) {
            for (const member of series.students) {
              if (!studentIds.includes(member.studentId)) continue
              if (rows.some(row => row.studentId === member.studentId && row.classId === item.id)) continue
              rows.push({ studentId: member.studentId, studentName: member.studentId, classId: item.id, className: item.name })
            }
          }
        }
        return rows
      }),
    },
    lesson: {
      findById: vi.fn(async (id: string) => state.lessons.find(lesson => lesson.id === id) ?? null),
      findBySeries: vi.fn(async (id: string) => state.lessons.filter(lesson => lesson.seriesId === id).sort((a, b) => +a.startsAt - +b.startsAt)),
      findManyBetween: vi.fn(async (from: Date, to: Date) => state.lessons.filter(lesson => lesson.status !== 'CANCELLED' && lesson.startsAt < to && +lesson.startsAt + lesson.durationMin * 60000 > +from)),
      findByClass: vi.fn(async (classId: string) => state.lessons.filter(lesson => lesson.classId === classId || state.series.find(series => series.id === lesson.seriesId)?.classId === classId)),
      deleteMany: vi.fn(async (ids: string[]) => {
        const before = state.lessons.length
        state.lessons = state.lessons.filter(lesson => !ids.includes(lesson.id))
        return before - state.lessons.length
      }),
      create: vi.fn(async (data: Record<string, unknown> & { studentIds: string[] }) => {
        const lesson = { id: crypto.randomUUID(), version: 1, status: 'SCHEDULED', seriesId: null, classId: null, originalStartAt: null, isException: false, shareNote: false, googleEventId: null, googleCalendarId: null, note: null, coachName: null, createdAt: new Date(), updatedAt: new Date(), series: null, ...data, students: data.studentIds.map(member) } as unknown as LessonRecord
        state.lessons.push(lesson)
        return lesson
      }),
      update: vi.fn(async (id: string, data: object, version?: number) => {
        const lesson = state.lessons.find(row => row.id === id)!
        if (version !== undefined && lesson.version !== version) fail('LESSON_CONFLICT')
        Object.assign(lesson, data, { version: lesson.version + 1 })
        return lesson
      }),
      replaceStudents: vi.fn(async (id: string, ids: string[]) => {
        state.lessons.find(row => row.id === id)!.students = ids.map(member) as unknown as LessonRecord['students']
      }),
    },
    lessonSeries: {
      findMany: vi.fn(async () => state.series),
      findById: vi.fn(async (id: string) => state.series.find(series => series.id === id) ?? null),
      create: vi.fn(async (data: Record<string, unknown> & { studentIds: string[] }) => {
        const series = { id: crypto.randomUUID(), version: 1, isActive: true, intervalWeeks: 1, occurrenceCount: null, endsOn: null, materializedUntil: null, googleEventId: null, googleCalendarId: null, timeZone: 'Asia/Ho_Chi_Minh', classId: null, ...data, students: data.studentIds.map(studentId => ({ studentId, seriesId: '' })) } as unknown as LessonSeriesRecord
        state.series.push(series)
        return series
      }),
      update: vi.fn(async (id: string, data: object, version?: number) => {
        const series = state.series.find(row => row.id === id)!
        if (version !== undefined && series.version !== version) fail('LESSON_CONFLICT')
        Object.assign(series, data, { version: series.version + 1 })
        return series
      }),
      replaceStudents: vi.fn(async (id: string, ids: string[]) => {
        state.series.find(row => row.id === id)!.students = ids.map(studentId => ({ studentId, seriesId: id })) as unknown as LessonSeriesRecord['students']
      }),
      delete: vi.fn(async (id: string) => { state.series = state.series.filter(row => row.id !== id) }),
    },
    audit: { append: vi.fn() },
    calendarConnection: {
      find: vi.fn(async () => null),
      updateToken: vi.fn(async (id: string, data: object) => ({ id, ...data, generation: 'g' })),
    },
    googleCalendar: {
      encrypt: vi.fn((value: string) => value),
      decrypt: vi.fn((value: string) => value),
      deleteEvent: vi.fn(),
    },
    calendarSync: {
      enqueue: vi.fn(async (kind: string, entityId: string) => {
        state.jobs.push({ id: crypto.randomUUID(), kind, entityId, entityKey: `${kind}:${entityId}`, version: 1, status: 'PENDING', attempts: 0, nextAttemptAt: new Date(), lastError: null, syncedAt: null, updatedAt: new Date() })
      }),
    },
  } as unknown as Repositories
})

describe('tạo lớp và khung giờ', () => {
  it('tạo lớp với 2 khung giờ: mọi chuỗi thuộc lớp và sinh buổi', async () => {
    const result = await createClass({ staffId: 'admin', name: 'Lớp cung cơ bản', coachName: 'HLV A', studentIds: ['a'], slots: [slot(1, '18:00'), slot(4, '19:30')] })
    expect(result.ok).toBe(true)
    const classId = result.ok ? result.value.lessonClass.id : ''
    expect(state.series).toHaveLength(2)
    expect(state.series.every(series => series.classId === classId)).toBe(true)
    expect(state.series.every(series => series.title === 'Lớp cung cơ bản')).toBe(true)
    expect(state.lessons.length).toBeGreaterThan(0)
    expect(state.lessons.every(lesson => lesson.students.length === 1)).toBe(true)
  })

  it('thêm khung giờ mới dùng sổ học viên hiện tại của lớp', async () => {
    const created = await createClass({ staffId: 'admin', name: 'Lớp nâng cao', studentIds: ['a'], slots: [slot(2, '18:00')] })
    const classId = created.ok ? created.value.lessonClass.id : ''
    const added = await createClassSlot({ staffId: 'admin', classId, daysOfWeek: [5], startTime: '20:00', durationMin: 90, startsOn: futureOn(5) })
    expect(added.ok).toBe(true)
    const newSeries = state.series.find(series => series.startTime === '20:00')!
    expect(newSeries.classId).toBe(classId)
    expect(newSeries.students.map(row => row.studentId)).toEqual(['a'])
  })
})

describe('sổ học viên của lớp', () => {
  it('áp cho khung giờ và buổi tương lai, bỏ qua buổi đã điểm danh', async () => {
    const created = await createClass({ staffId: 'admin', name: 'Lớp cung', studentIds: ['a'], slots: [slot(3, '18:00')] })
    const classId = created.ok ? created.value.lessonClass.id : ''
    const locked = state.lessons[0]
    locked.students = [member('a')] as unknown as LessonRecord['students']
    locked.students[0].status = 'COMPLETED'

    const result = await setClassRoster({ staffId: 'admin', classId, studentIds: ['a', 'b'] })
    expect(result.ok).toBe(true)
    expect(result.ok ? result.value.skippedLocked : -1).toBe(1)
    expect(locked.students.map(row => row.studentId)).toEqual(['a'])
    expect(state.series[0].students.map(row => row.studentId).sort()).toEqual(['a', 'b'])
    const other = state.lessons.find(lesson => lesson.id !== locked.id)!
    expect(other.students.map(row => row.studentId).sort()).toEqual(['a', 'b'])
  })
})

describe('đổi thông tin lớp', () => {
  it('đổi tên kéo theo tiêu đề khung giờ và buổi chưa điểm danh', async () => {
    const created = await createClass({ staffId: 'admin', name: 'Lớp cũ', studentIds: ['a'], slots: [slot(2, '18:00')] })
    const classId = created.ok ? created.value.lessonClass.id : ''
    const past = state.lessons[0]
    past.startsAt = new Date(Date.now() - 7 * DAY_MS)

    const result = await updateClass({ staffId: 'admin', classId, name: 'Lớp mới' })
    expect(result.ok).toBe(true)
    expect(state.series[0].title).toBe('Lớp mới')
    expect(past.title).toBe('Lớp cũ')
    expect(state.lessons.filter(lesson => lesson.startsAt >= new Date()).every(lesson => lesson.title === 'Lớp mới')).toBe(true)
  })

  it('xoá lớp rỗng hoặc thêm nhầm: xoá cả khung giờ lẫn buổi chưa điểm danh', async () => {
    const created = await createClass({ staffId: 'admin', name: 'Lớp nhầm', studentIds: ['a'], slots: [slot(2, '18:00')] })
    const classId = created.ok ? created.value.lessonClass.id : ''
    expect(state.lessons.length).toBeGreaterThan(0)

    const result = await deleteClass({ staffId: 'admin', classId }, state.repos)
    expect(result.ok).toBe(true)
    expect(result.ok ? result.value.deletedLessons : 0).toBeGreaterThan(0)
    expect(state.classes).toHaveLength(0)
    expect(state.series).toHaveLength(0)
    expect(state.lessons).toHaveLength(0)
  })

  it('xoá cứng cả buổi đã điểm danh', async () => {
    const created = await createClass({ staffId: 'admin', name: 'Lớp nhầm', studentIds: ['a'], slots: [slot(2, '18:00')] })
    const classId = created.ok ? created.value.lessonClass.id : ''
    state.lessons[0].students[0].status = 'COMPLETED'

    const result = await deleteClass({ staffId: 'admin', classId }, state.repos)
    expect(result.ok).toBe(true)
    expect(result.ok ? result.value.deletedLessons : 0).toBeGreaterThan(0)
    expect(state.classes).toHaveLength(0)
    expect(state.series).toHaveLength(0)
    expect(state.lessons).toHaveLength(0)
  })

  it('xoá event Google của khung giờ trước khi xoá dữ liệu', async () => {
    const created = await createClass({ staffId: 'admin', name: 'Lớp nhầm', slots: [slot(2, '18:00')] })
    const classId = created.ok ? created.value.lessonClass.id : ''
    Object.assign(state.series[0], { googleEventId: 'g-event-1', googleCalendarId: 'club' })
    state.repos.calendarConnection.find = vi.fn(async () => ({
      id: 'single', email: 'club@example.com', calendarId: 'club', needsReconnect: false, accessToken: 'enc', refreshToken: 'enc',
      tokenExpiresAt: new Date(Date.now() + 3_600_000), generation: 'g', connectedAt: new Date(), leaseUntil: null, leaseOwner: null,
    }))

    const result = await deleteClass({ staffId: 'admin', classId }, state.repos)
    expect(result.ok).toBe(true)
    expect(state.repos.googleCalendar.deleteEvent).toHaveBeenCalledWith('enc', 'club', 'g-event-1')
  })
})

describe('ràng buộc một học viên chỉ thuộc một lớp', () => {
  it('chặn học viên đã ở lớp khác khi lưu sổ lớp', async () => {
    await createClass({ staffId: 'admin', name: 'Lớp A', studentIds: ['a'], slots: [slot(2, '18:00')] })
    const other = await createClass({ staffId: 'admin', name: 'Lớp B' })
    const classId = other.ok ? other.value.lessonClass.id : ''

    const result = await setClassRoster({ staffId: 'admin', classId, studentIds: ['a'] })
    expect(result).toMatchObject({ ok: false, error: { code: 'CLASS_STUDENT_TAKEN' } })
    expect(result.ok ? '' : result.error.detail).toContain('Lớp A')
  })

  it('chặn tương tự khi xếp một học viên vào lớp', async () => {
    await createClass({ staffId: 'admin', name: 'Lớp A', studentIds: ['a'], slots: [slot(2, '18:00')] })
    const other = await createClass({ staffId: 'admin', name: 'Lớp B' })
    const classId = other.ok ? other.value.lessonClass.id : ''

    const result = await addClassStudent({ staffId: 'admin', classId, studentId: 'a' })
    expect(result).toMatchObject({ ok: false, error: { code: 'CLASS_STUDENT_TAKEN' } })
  })

  it('xếp và rút một học viên áp cho khung giờ lẫn buổi tương lai', async () => {
    const created = await createClass({ staffId: 'admin', name: 'Lớp C', studentIds: ['a'], slots: [slot(3, '18:00')] })
    const classId = created.ok ? created.value.lessonClass.id : ''

    const added = await addClassStudent({ staffId: 'admin', classId, studentId: 'b' })
    expect(added.ok).toBe(true)
    expect(state.series[0].students.map(row => row.studentId).sort()).toEqual(['a', 'b'])
    expect(state.lessons.every(lesson => lesson.students.length === 2)).toBe(true)

    const removed = await removeClassStudent({ staffId: 'admin', classId, studentId: 'a' })
    expect(removed.ok).toBe(true)
    expect(state.series[0].students.map(row => row.studentId)).toEqual(['b'])
    expect(state.lessons.every(lesson => lesson.students.length === 1)).toBe(true)
  })

  it('chuỗi thuộc lớp chặn học viên lớp khác, chuỗi tự do vẫn cho phép', async () => {
    const created = await createClass({ staffId: 'admin', name: 'Lớp A', studentIds: ['a'], slots: [slot(2, '18:00')] })
    const classA = created.ok ? created.value.lessonClass.id : ''
    await createClass({ staffId: 'admin', name: 'Lớp B', studentIds: ['b'], slots: [slot(4, '18:00')] })

    const seriesA = state.series.find(row => row.classId === classA)!
    const anchor = state.lessons.filter(lesson => lesson.seriesId === seriesA.id).sort((x, y) => +x.startsAt - +y.startsAt)[0]
    const blocked = await updateSeries({ staffId: 'admin', seriesId: seriesA.id, version: seriesA.version, scope: 'FOLLOWING', lessonId: anchor.id, studentIds: ['a', 'b'] }, state.repos)
    expect(blocked).toMatchObject({ ok: false, error: { code: 'CLASS_STUDENT_TAKEN' } })

    const plain = await createSeries({ staffId: 'admin', title: 'Chuỗi tự do', daysOfWeek: [6], startTime: '09:00', durationMin: 60, startsOn: futureOn(6), studentIds: ['c'] }, state.repos)
    const plainSeries = plain.ok ? plain.value.series : null
    const plainAnchor = state.lessons.filter(lesson => lesson.seriesId === plainSeries!.id)[0]
    const allowed = await updateSeries({ staffId: 'admin', seriesId: plainSeries!.id, version: plainSeries!.version, scope: 'FOLLOWING', lessonId: plainAnchor.id, studentIds: ['c', 'b'] }, state.repos)
    expect(allowed.ok).toBe(true)
  })
})

describe('sửa khung giờ', () => {
  it('tách chuỗi mới từ buổi sắp tới và giữ nguyên lớp', async () => {
    const created = await createClass({ staffId: 'admin', name: 'Lớp tách', studentIds: ['a'], slots: [slot(6, '18:00')] })
    const classId = created.ok ? created.value.lessonClass.id : ''
    const oldSeries = state.series[0]

    const result = await updateClassSlot({ staffId: 'admin', classId, slotId: oldSeries.id, version: oldSeries.version, scope: 'FOLLOWING', startTime: '20:00' }, state.repos)
    expect(result.ok).toBe(true)
    expect(state.series).toHaveLength(2)
    const next = state.series.find(series => series.id !== oldSeries.id)!
    expect(next.classId).toBe(classId)
    expect(next.startTime).toBe('20:00')
    expect(oldSeries.endsOn).not.toBeNull()
    const anchor = state.lessons.filter(lesson => lesson.seriesId === next.id).sort((a, b) => +a.startsAt - +b.startsAt)[0]
    expect(oldSeries.endsOn!.getTime()).toBeLessThan(anchor.startsAt.getTime())
  })
})
