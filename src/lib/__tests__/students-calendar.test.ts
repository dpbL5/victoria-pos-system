import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LessonRecord, LessonSeriesRecord, CalendarSyncJobRecord } from '@/lib/students/ports'
import type { Repositories } from '@/lib/infrastructure/repositories'

vi.mock('@/lib/infrastructure/prisma', () => ({ prisma: {} }))
const state = vi.hoisted(() => ({
  lessons: [] as LessonRecord[], series: [] as LessonSeriesRecord[], jobs: [] as CalendarSyncJobRecord[], repos: null as unknown as Repositories,
}))
vi.mock('@/lib/infrastructure/db-helpers', async original => {
  const actual = await original<typeof import('@/lib/infrastructure/db-helpers')>()
  return { ...actual, runInTransaction: vi.fn(async (work: (repos: Repositories) => Promise<unknown>) => {
    const before = structuredClone({ lessons: state.lessons, series: state.series, jobs: state.jobs })
    try { return { ok: true, value: await work(state.repos) } }
    catch (error) {
      Object.assign(state, before)
      if (error instanceof actual.RollbackSignal) return { ok: false, error: error.error }
      throw error
    }
  }) }
})
import { weeklyOccurrences, weeklyRrule, overlaps, createLesson, updateLesson, createSeries, updateSeries, deleteLesson, ensureLessonsUntil, processCalendarJobs } from '@/lib/students'
import { fail } from '@/lib/infrastructure/db-helpers'

const future = () => new Date(Date.now() + 30 * 86400000)
const member = (id: string) => ({ id, studentId: id, lessonId: '', status: 'SCHEDULED', note: null, packageId: null, package: null, student: { id, fullName: id } })
const base = () => ({ staffId: 'admin', title: 'Lớp cung', studentIds: ['a'], startsAt: future(), durationMin: 60 })

beforeEach(() => {
  state.lessons = []; state.series = []; state.jobs = []
  state.repos = {
    student: { findById: vi.fn(async (id: string) => ({ id, status: 'ACTIVE', deletedAt: null })) },
    lesson: {
      findById: vi.fn(async (id: string) => state.lessons.find(l => l.id === id) ?? null),
      findBySeries: vi.fn(async (id: string) => state.lessons.filter(l => l.seriesId === id).sort((a, b) => +a.startsAt - +b.startsAt)),
      findManyBetween: vi.fn(async (from: Date, to: Date) => state.lessons.filter(l => l.status !== 'CANCELLED' && l.startsAt < to && +l.startsAt + l.durationMin * 60000 > +from)),
      create: vi.fn(async (data: Record<string, unknown> & { studentIds: string[] }) => {
        const lesson = { id: crypto.randomUUID(), version: 1, status: 'SCHEDULED', seriesId: null, originalStartAt: null, isException: false, shareNote: false, googleEventId: null, googleCalendarId: null, note: null, coachName: null, createdAt: new Date(), updatedAt: new Date(), series: null, ...data, students: data.studentIds.map(member) } as unknown as LessonRecord
        state.lessons.push(lesson); return lesson
      }),
      update: vi.fn(async (id: string, data: object, version?: number) => {
        const lesson = state.lessons.find(l => l.id === id)!
        if (version !== undefined && lesson.version !== version) fail('LESSON_CONFLICT')
        Object.assign(lesson, data, { version: lesson.version + 1 }); return lesson
      }),
      replaceStudents: vi.fn(async (id: string, ids: string[]) => { state.lessons.find(l => l.id === id)!.students = ids.map(member) as unknown as LessonRecord['students'] }),
    },
    lessonSeries: {
      findMany: vi.fn(async () => state.series),
      findById: vi.fn(async (id: string) => state.series.find(s => s.id === id) ?? null),
      create: vi.fn(async (data: Record<string, unknown> & { studentIds: string[] }) => {
        const series = { id: crypto.randomUUID(), version: 1, isActive: true, intervalWeeks: 1, occurrenceCount: null, endsOn: null, materializedUntil: null, googleEventId: null, googleCalendarId: null, timeZone: 'Asia/Ho_Chi_Minh', ...data, students: data.studentIds.map(studentId => ({ studentId, seriesId: '' })) } as unknown as LessonSeriesRecord
        state.series.push(series); return series
      }),
      update: vi.fn(async (id: string, data: object, version?: number) => {
        const series = state.series.find(s => s.id === id)!
        if (version !== undefined && series.version !== version) fail('LESSON_CONFLICT')
        Object.assign(series, data, { version: series.version + 1 }); return series
      }),
    },
    audit: { append: vi.fn() },
    calendarSync: {
      summary: vi.fn(), getMapping: vi.fn(async () => null), setMapping: vi.fn(), remapPrimary: vi.fn(),
      enqueue: vi.fn(async (kind: string, entityId: string) => {
        const old = state.jobs.find(j => j.entityKey === `${kind}:${entityId}`)
        if (old) Object.assign(old, { version: old.version + 1, status: 'PENDING' })
        else state.jobs.push({ id: crypto.randomUUID(), kind, entityId, entityKey: `${kind}:${entityId}`, version: 1, status: 'PENDING', attempts: 0, nextAttemptAt: new Date(), lastError: null, syncedAt: null, updatedAt: new Date() })
      }),
      pending: vi.fn(async () => state.jobs.filter(j => j.status === 'PENDING').map(j => ({ ...j }))),
      list: vi.fn(async (ids?: string[]) => state.jobs.filter(j => !ids || ids.includes(j.entityId))),
      finish: vi.fn(async (id: string, version: number, error?: { retry: boolean; message: string }) => {
        const job = state.jobs.find(j => j.id === id)!
        if (job.version === version) Object.assign(job, { status: error ? error.retry ? 'PENDING' : 'ERROR' : 'SYNCED', lastError: error?.message ?? null })
      }),
      acquire: vi.fn(async () => true), release: vi.fn(), reconnectRequired: vi.fn(),
    },
    calendarConnection: {
      find: vi.fn(async () => ({ id: 'single', generation: 'g', calendarId: 'club', accessToken: 'encrypted', refreshToken: 'encrypted-refresh', tokenExpiresAt: new Date(Date.now() + 3600000), needsReconnect: false })),
      updateToken: vi.fn(async () => ({ id: 'single', generation: 'g', calendarId: 'club', tokenExpiresAt: future() })),
    },
    googleCalendar: { encrypt: vi.fn(v => v), decrypt: vi.fn(v => v), refresh: vi.fn(), putEvent: vi.fn(async () => 'google-id'), deleteEvent: vi.fn(), instance: vi.fn(async () => 'instance-id') },
  } as unknown as Repositories
})

describe('lịch tuần và múi giờ', () => {
  const rule = { daysOfWeek: [1, 3], startTime: '18:00', startsOn: new Date('2026-09-07T00:00:00+07:00'), intervalWeeks: 2, occurrenceCount: 3 }
  it('N tuần và COUNT tính từ đầu, cả khi xem khoảng sau', () => {
    expect(weeklyOccurrences(rule, new Date('2026-09-14T00:00:00+07:00'), new Date('2026-10-01T00:00:00+07:00')).map(d => d.toISOString())).toEqual(['2026-09-21T11:00:00.000Z'])
    expect(weeklyRrule(rule)).toBe('RRULE:FREQ=WEEKLY;WKST=MO;INTERVAL=2;BYDAY=MO,WE;COUNT=3')
  })
  it('ngày kết thúc bao gồm buổi trong ngày đó; buổi tiếp giáp không trùng', () => {
    const schedule = { ...rule, intervalWeeks: 1, occurrenceCount: null, endsOn: new Date('2026-09-09T23:59:59+07:00') }
    expect(weeklyOccurrences(schedule, rule.startsOn, new Date('2026-10-01T00:00:00Z'))).toHaveLength(2)
    expect(overlaps({ startsAt: new Date(0), durationMin: 60 }, { startsAt: new Date(3600000), durationMin: 60 })).toBe(false)
  })
})

describe('lưu buổi học và bảo toàn dữ liệu', () => {
  it('lưu DB và job, không gọi Google trong nghiệp vụ tạo', async () => {
    const result = await createLesson(base(), state.repos)
    expect(result.ok).toBe(true); expect(state.lessons).toHaveLength(1); expect(state.jobs).toHaveLength(1)
    expect(state.repos.googleCalendar.putEvent).not.toHaveBeenCalled()
  })
  it('chặn trùng giờ và rollback không tạo job thừa', async () => {
    const input = base()
    await createLesson(input, state.repos)
    const result = await createLesson(input, state.repos)
    expect(result).toMatchObject({ ok: false, error: { code: 'LESSON_OVERLAP' } })
    expect(state.lessons).toHaveLength(1); expect(state.jobs).toHaveLength(1)
  })
  it('ghi chú rỗng lưu được; bản cũ không ghi đè', async () => {
    await createLesson({ ...base(), note: 'Ghi chú cũ' }, state.repos)
    const lesson = state.lessons[0]
    const version = lesson.version
    expect((await updateLesson({ staffId: 'admin', lessonId: lesson.id, version, note: '' }, state.repos)).ok).toBe(true)
    expect(state.lessons[0].note).toBe('')
    expect(await updateLesson({ staffId: 'admin', lessonId: lesson.id, version, note: 'ghi đè' }, state.repos)).toMatchObject({ ok: false, error: { code: 'LESSON_CONFLICT' } })
  })
  it('buổi đã điểm danh chỉ sửa note, không đổi giờ hoặc huỷ', async () => {
    await createLesson(base(), state.repos)
    const lesson = state.lessons[0]
    lesson.students[0].status = 'COMPLETED'
    expect((await updateLesson({ staffId: 'admin', lessonId: lesson.id, version: lesson.version, note: 'Tiến bộ' }, state.repos)).ok).toBe(true)
    expect((await deleteLesson({ staffId: 'admin', lessonId: lesson.id, version: lesson.version }, state.repos)).ok).toBe(false)
  })
})

async function series() {
  return createSeries({ staffId: 'admin', title: 'Lịch lặp', studentIds: ['a'], startsOn: future(), daysOfWeek: [1, 3], startTime: '18:00', durationMin: 60 }, state.repos)
}

describe('chuỗi và ngoại lệ', () => {
  it('sinh tiếp sau 12 tuần, chạy lại không sinh trùng, không hồi sinh buổi đã huỷ', async () => {
    expect((await series()).ok).toBe(true)
    const count = state.lessons.length
    const first = state.lessons[0]
    await deleteLesson({ staffId: 'admin', lessonId: first.id, version: first.version }, state.repos)
    const target = new Date(future().getTime() + 120 * 86400000)
    await ensureLessonsUntil(target, state.repos)
    const expanded = state.lessons.length
    expect(expanded).toBeGreaterThan(count)
    await ensureLessonsUntil(target, state.repos)
    expect(state.lessons).toHaveLength(expanded)
    expect(state.lessons.find(l => l.id === first.id)?.status).toBe('CANCELLED')
  })
  it('sửa buổi riêng giữ occurrence gốc và ghi chú của các buổi khác', async () => {
    await series()
    const first = state.lessons[0]
    const original = first.originalStartAt
    await updateLesson({ staffId: 'admin', lessonId: first.id, version: first.version, startsAt: new Date(+first.startsAt + 3600000), note: 'Học bù' }, state.repos)
    expect(state.lessons[0]).toMatchObject({ originalStartAt: original, note: 'Học bù', isException: true })
    expect(state.lessons[1].note).toBe(null)
  })
  it('tách chuỗi giữ ID/ghi chú và buổi đã huỷ', async () => {
    await series()
    const first = state.lessons[0], second = state.lessons[1]
    first.note = 'Giữ ghi chú'
    second.status = 'CANCELLED'; second.isException = true
    const oldId = first.seriesId!
    const oldVersion = state.series[0].version
    const result = await updateSeries({ staffId: 'admin', seriesId: oldId, version: oldVersion, lessonId: first.id, scope: 'FOLLOWING', title: 'Tên mới' }, state.repos)
    expect(result.ok).toBe(true)
    expect(state.lessons.find(l => l.id === first.id)?.note).toBe('Giữ ghi chú')
    expect(state.lessons.find(l => l.id === second.id)?.status).toBe('CANCELLED')
    expect(state.lessons.find(l => l.id === first.id)?.seriesId).not.toBe(oldId)
  })
  it('phát hiện xung đột lịch tuần bắt đầu sau horizon hiện tại', async () => {
    await series()
    const result = await createSeries({ staffId: 'admin', title: 'Trùng', studentIds: ['a'], startsOn: new Date(future().getTime() + 200 * 86400000), daysOfWeek: [1], startTime: '18:30', durationMin: 60 }, state.repos)
    expect(result).toMatchObject({ ok: false, error: { code: 'LESSON_OVERLAP' } })
  })
})

describe('đồng bộ bền vững', () => {
  it('lỗi Google giữ lịch và job để thử lại', async () => {
    await createLesson(base(), state.repos)
    vi.mocked(state.repos.googleCalendar.putEvent).mockRejectedValueOnce(Object.assign(new Error('Tạm lỗi'), { status: 503 }))
    await processCalendarJobs(state.repos)
    expect(state.lessons).toHaveLength(1); expect(state.jobs[0].status).toBe('PENDING')
    await processCalendarJobs(state.repos)
    expect(state.jobs[0].status).toBe('SYNCED')
    const calls = vi.mocked(state.repos.googleCalendar.putEvent).mock.calls
    expect(calls[0][2]).toBe(calls[1][2])
  })
  it('ghi chú riêng không ra Google; xoá ghi chú gửi description rỗng', async () => {
    await createLesson({ ...base(), note: 'Nội bộ' }, state.repos)
    await processCalendarJobs(state.repos)
    expect(vi.mocked(state.repos.googleCalendar.putEvent).mock.calls[0][3]).toMatchObject({ description: '' })
  })
  it('huỷ trước khi sync không tạo sự kiện', async () => {
    await createLesson(base(), state.repos)
    const lesson = state.lessons[0]
    await deleteLesson({ staffId: 'admin', lessonId: lesson.id, version: lesson.version }, state.repos)
    await processCalendarJobs(state.repos)
    expect(state.repos.googleCalendar.putEvent).not.toHaveBeenCalled()
    expect(state.repos.googleCalendar.deleteEvent).toHaveBeenCalledOnce()
  })
  it('token bị thu hồi hiển thị yêu cầu kết nối lại', async () => {
    await createLesson(base(), state.repos)
    vi.mocked(state.repos.googleCalendar.putEvent).mockRejectedValue(Object.assign(new Error('Token hết hiệu lực'), { status: 401 }))
    await processCalendarJobs(state.repos)
    expect(state.repos.calendarSync.reconnectRequired).toHaveBeenCalledOnce()
    expect(state.jobs[0].status).toBe('ERROR')
  })
})
