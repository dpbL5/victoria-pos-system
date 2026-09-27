import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LessonRecord, LessonSeriesRecord, CalendarSyncJobRecord, CalendarConnectionRecord } from '@/lib/students/ports'
import type { Repositories } from '@/lib/infrastructure/repositories'

vi.mock('@/lib/infrastructure/prisma', () => ({ prisma: {} }))
const state = vi.hoisted(() => ({
  lessons: [] as LessonRecord[], series: [] as LessonSeriesRecord[], jobs: [] as CalendarSyncJobRecord[],
  connections: [] as CalendarConnectionRecord[], repos: null as unknown as Repositories,
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
import { weeklyOccurrences, weeklyRrule, overlaps, createLesson, updateLesson, createSeries, updateSeries, deleteLesson, ensureLessonsUntil, getCalendarStatus, maintainCalendar, retryCalendar } from '@/lib/students'
import { fail } from '@/lib/infrastructure/db-helpers'

const future = () => new Date(Date.now() + 30 * 86400000)
const member = (id: string) => ({ id, studentId: id, lessonId: '', status: 'SCHEDULED', note: null, student: { id, fullName: id } })
const base = () => ({ staffId: 'admin', title: 'Lớp cung', studentIds: ['a'], startsAt: future(), durationMin: 60 })
const connection = (id: string, userId: string, calendarId: string | null): CalendarConnectionRecord => ({
  id, userId, email: `${userId}@gmail.com`, accessToken: 'encrypted', refreshToken: 'encrypted-refresh', tokenExpiresAt: future(),
  calendarId, connectedAt: new Date(), generation: `g-${id}`, needsReconnect: false, leaseUntil: null, leaseOwner: null,
})

beforeEach(() => {
  state.lessons = []; state.series = []; state.jobs = []
  state.connections = [connection('conn-admin', 'admin', 'club')]
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
    lessonClass: { findById: vi.fn(async () => ({ id: 'class-1', isActive: true, students: [{ studentId: 'a' }] })), classesOfStudents: vi.fn(async () => []) },
    calendarSync: {
      summary: vi.fn(async (connectionId: string) => ({
        pending: state.jobs.filter(j => j.connectionId === connectionId && j.status === 'PENDING').length,
        failed: state.jobs.filter(j => j.connectionId === connectionId && j.status === 'ERROR').length,
        lastSyncedAt: null,
      })),
      getMapping: vi.fn(async () => null), setMapping: vi.fn(), remapPrimary: vi.fn(),
      // Fan-out: mỗi connection đã chọn lịch đích nhận 1 job.
      enqueue: vi.fn(async (kind: string, entityId: string) => {
        const entityKey = `${kind}:${entityId}`
        for (const conn of state.connections.filter(c => c.calendarId)) {
          const old = state.jobs.find(j => j.connectionId === conn.id && j.entityKey === entityKey)
          if (old) Object.assign(old, { version: old.version + 1, status: 'PENDING' })
          else state.jobs.push({ id: crypto.randomUUID(), connectionId: conn.id, kind, entityId, entityKey, version: 1, status: 'PENDING', attempts: 0, nextAttemptAt: new Date(), lastError: null, syncedAt: null, updatedAt: new Date() } as CalendarSyncJobRecord)
        }
      }),
      pending: vi.fn(async (connectionId: string) => state.jobs.filter(j => j.connectionId === connectionId && j.status === 'PENDING' && j.nextAttemptAt <= new Date()).map(j => ({ ...j }))),
      list: vi.fn(async (connectionId: string, ids?: string[]) => state.jobs.filter(j => j.connectionId === connectionId && (!ids || ids.includes(j.entityId)))),
      finish: vi.fn(async (id: string, version: number, error?: { retry: boolean; message: string; attempts: number }) => {
        const job = state.jobs.find(j => j.id === id)!
        if (job.version !== version) return
        Object.assign(job, error
          ? { status: error.retry ? 'PENDING' : 'ERROR', lastError: error.message, attempts: job.attempts + 1, nextAttemptAt: new Date(Date.now() + (error.retry ? 30_000 : 0)) }
          : { status: 'SYNCED', lastError: null })
      }),
      retry: vi.fn(async (connectionId: string) => { for (const job of state.jobs) if (job.connectionId === connectionId && job.status !== 'SYNCED') Object.assign(job, { status: 'PENDING', attempts: 0, nextAttemptAt: new Date(), lastError: null }) }),
      acquire: vi.fn(async () => true), release: vi.fn(), reconnectRequired: vi.fn(),
    },
    calendarConnection: {
      findByUser: vi.fn(async (userId: string) => state.connections.find(c => c.userId === userId) ?? null),
      findById: vi.fn(async (id: string) => state.connections.find(c => c.id === id) ?? null),
      listReady: vi.fn(async () => state.connections.filter(c => c.calendarId && !c.needsReconnect)),
      upsertForUser: vi.fn(async (userId: string, data: Record<string, unknown>) => {
        const found = state.connections.find(c => c.userId === userId)
        if (found) Object.assign(found, data)
        else state.connections.push(connection(crypto.randomUUID(), userId, null))
        return state.connections.find(c => c.userId === userId)!
      }),
      updateToken: vi.fn(async (id: string, data: Record<string, unknown>) => Object.assign(state.connections.find(c => c.id === id)!, data)),
      delete: vi.fn(async (id: string) => { state.connections = state.connections.filter(c => c.id !== id) }),
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

describe('ràng buộc một học viên chỉ thuộc một lớp (module Lịch)', () => {
  it('chặn tạo chuỗi gắn lớp với học viên đang ở lớp khác', async () => {
    vi.mocked(state.repos.lessonClass.classesOfStudents).mockResolvedValue([{ studentId: 'a', studentName: 'A', classId: 'class-other', className: 'Lớp khác' }])

    const result = await createSeries({ staffId: 'admin', classId: 'class-1', title: 'Lịch lớp', studentIds: ['a'], startsOn: future(), daysOfWeek: [1], startTime: '18:00', durationMin: 60 }, state.repos)

    expect(result).toMatchObject({ ok: false, error: { code: 'CLASS_STUDENT_TAKEN' } })
    expect(state.series).toHaveLength(0)
  })
  it('chặn buổi lẻ gắn lớp với học viên lớp khác, nhưng cho qua học viên của chính lớp đó', async () => {
    vi.mocked(state.repos.lessonClass.classesOfStudents).mockResolvedValue([{ studentId: 'a', studentName: 'A', classId: 'class-1', className: 'Lớp 1' }])
    expect((await createLesson({ ...base(), classId: 'class-1' }, state.repos)).ok).toBe(true)

    vi.mocked(state.repos.lessonClass.classesOfStudents).mockResolvedValue([{ studentId: 'a', studentName: 'A', classId: 'class-2', className: 'Lớp 2' }])
    const blocked = await createLesson({ ...base(), classId: 'class-1' }, state.repos)

    expect(blocked).toMatchObject({ ok: false, error: { code: 'CLASS_STUDENT_TAKEN' } })
    expect(state.lessons).toHaveLength(1)
  })
})

describe('đồng bộ bền vững', () => {
  /** Nút "Đồng bộ với Google Calendar" — đường duy nhất đẩy lịch lên Google. */
  const press = (staffId = 'admin') => retryCalendar({ staffId, from: new Date(Date.now() - 86400000), to: new Date(Date.now() + 60 * 86400000) }, state.repos)

  it('lỗi Google giữ lịch và job để bấm lại', async () => {
    await createLesson(base(), state.repos)
    vi.mocked(state.repos.googleCalendar.putEvent).mockRejectedValueOnce(Object.assign(new Error('Tạm lỗi'), { status: 503 }))
    await press()
    expect(state.lessons).toHaveLength(1); expect(state.jobs[0].status).toBe('PENDING')
    await press()
    expect(state.jobs[0].status).toBe('SYNCED')
    const calls = vi.mocked(state.repos.googleCalendar.putEvent).mock.calls
    expect(calls[0][2]).toBe(calls[1][2])
  })
  it('ghi chú buổi học gửi cùng sự kiện khi đồng bộ toàn bộ lịch', async () => {
    await createLesson({ ...base(), note: 'Nội bộ' }, state.repos)
    await press()
    expect(vi.mocked(state.repos.googleCalendar.putEvent).mock.calls[0][3]).toMatchObject({ description: 'Nội bộ' })
  })
  it('huỷ trước khi sync không tạo sự kiện', async () => {
    await createLesson(base(), state.repos)
    const lesson = state.lessons[0]
    await deleteLesson({ staffId: 'admin', lessonId: lesson.id, version: lesson.version }, state.repos)
    await press()
    expect(state.repos.googleCalendar.putEvent).not.toHaveBeenCalled()
    expect(state.repos.googleCalendar.deleteEvent).toHaveBeenCalledOnce()
  })
  it('token bị thu hồi hiển thị yêu cầu kết nối lại', async () => {
    await createLesson(base(), state.repos)
    vi.mocked(state.repos.googleCalendar.putEvent).mockRejectedValue(Object.assign(new Error('Token hết hiệu lực'), { status: 401 }))
    await press()
    expect(state.repos.calendarSync.reconnectRequired).toHaveBeenCalledOnce()
    expect(state.jobs[0].status).toBe('ERROR')
  })
  it('sửa lịch chỉ đánh dấu chờ đồng bộ, không tự gọi Google', async () => {
    await createLesson(base(), state.repos)
    state.jobs.length = 0
    const lesson = state.lessons[0]
    expect((await updateLesson({ staffId: 'admin', lessonId: lesson.id, version: lesson.version, startsAt: new Date(+lesson.startsAt + 3600000) }, state.repos)).ok).toBe(true)
    expect(state.jobs).toHaveLength(1)
    expect(state.jobs[0].status).toBe('PENDING')
    expect(state.repos.googleCalendar.putEvent).not.toHaveBeenCalled()
  })
  it('cron chỉ sinh tiếp buổi học, không đẩy job lên Google', async () => {
    await createLesson(base(), state.repos)
    const result = await maintainCalendar(state.repos)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.processed).toBe(0)
    expect(state.repos.googleCalendar.putEvent).not.toHaveBeenCalled()
    expect(state.jobs[0].status).toBe('PENDING')
  })
  it('bấm đồng bộ xử lý job ngay trong request, không cần worker nền', async () => {
    await createLesson(base(), state.repos)
    expect(state.jobs[0].status).toBe('PENDING')

    const result = await press()

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.processed).toBeGreaterThan(0)
    expect(state.jobs.every(j => j.status === 'SYNCED')).toBe(true)
    expect(state.repos.googleCalendar.putEvent).toHaveBeenCalledOnce()
  })
})

describe('mỗi ADMIN một kết nối Google', () => {
  it('job tách theo connection; connection chưa chọn lịch không nhận job', async () => {
    state.connections.push(connection('conn-b', 'admin-b', 'club-b'), connection('conn-empty', 'admin-c', null))
    await createLesson(base(), state.repos)

    expect(state.jobs.map(j => j.connectionId)).toEqual(['conn-admin', 'conn-b'])
  })

  it('bấm đồng bộ chỉ xử lý connection của người bấm', async () => {
    state.connections.push(connection('conn-b', 'admin-b', 'club-b'))
    await createLesson(base(), state.repos)

    const mine = await retryCalendar({ staffId: 'admin', from: new Date(Date.now() - 86400000), to: new Date(Date.now() + 60 * 86400000) }, state.repos)

    expect(mine.ok && mine.value.processed).toBeGreaterThan(0)
    expect(state.jobs.find(j => j.connectionId === 'conn-admin')!.status).toBe('SYNCED')
    expect(state.jobs.find(j => j.connectionId === 'conn-b')!.status).toBe('PENDING')
    expect(state.repos.googleCalendar.putEvent).toHaveBeenCalledOnce()

    expect((await retryCalendar({ staffId: 'admin-b', from: new Date(Date.now() - 86400000), to: new Date(Date.now() + 60 * 86400000) }, state.repos)).ok).toBe(true)
    expect(state.jobs.find(j => j.connectionId === 'conn-b')!.status).toBe('SYNCED')
    expect(state.repos.googleCalendar.putEvent).toHaveBeenCalledTimes(2)
  })

  it('trạng thái chỉ đọc connection của chính người xem', async () => {
    state.connections.push(connection('conn-b', 'admin-b', 'club-b'))

    const mine = await getCalendarStatus('admin-b', state.repos)
    expect(mine.ok && mine.value.calendarId).toBe('club-b')

    const nobody = await getCalendarStatus('admin-c', state.repos)
    expect(nobody.ok && nobody.value.connected).toBe(false)
  })
})
