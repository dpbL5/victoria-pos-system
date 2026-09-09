// ── Adapter: implement các repository của domain Học viên bằng Prisma ─────
import { fail } from '../db-helpers'
import type { Prisma } from '@/generated/prisma/client'
import type {
  StudentRepository,
  LessonRepository,
  LessonSeriesRepository,
  LessonPackageRepository,
  CalendarConnectionRepository,
  CalendarSyncRepository,
} from '@/lib/students'

type StudentStore = Pick<
  Prisma.TransactionClient,
  | 'student'
  | 'lesson'
  | 'lessonSeries'
  | 'lessonPackage'
  | 'lessonStudent'
  | 'calendarConnection'
  | 'calendarSyncJob'
  | 'calendarEventMapping'
  | 'lessonSeriesStudent'
>

const lessonInclude = {
  students: { include: { student: true, package: true } },
  series: true,
} as const

const studentInclude = { packages: true } as const

export function createStudentRepository(store: StudentStore): StudentRepository {
  return {
    findMany: ({ search, status, limit, offset } = {}) =>
      store.student.findMany({
        where: {
          deletedAt: null,
          ...(status ? { status } : {}),
          ...(search
            ? {
                OR: [
                  { fullName: { contains: search, mode: 'insensitive' } },
                  { phone: { contains: search, mode: 'insensitive' } },
                ],
              }
            : {}),
        },
        include: studentInclude,
        orderBy: { fullName: 'asc' },
        take: limit ?? 100,
        skip: offset ?? 0,
      }),
    findById: (id) => store.student.findFirst({ where: { id, deletedAt: null }, include: studentInclude }),
    findByIdIncludingDeleted: (id) => store.student.findUnique({ where: { id }, include: studentInclude }),
    create: (data) => store.student.create({ data, include: studentInclude }),
    update: (id, data) => store.student.update({ where: { id }, data, include: studentInclude }),
    softDelete: (id) =>
      store.student.update({ where: { id }, data: { deletedAt: new Date(), status: 'INACTIVE' }, include: studentInclude }),
  }
}

export function createLessonRepository(store: StudentStore): LessonRepository {
  return {
    findManyBetween: async (from, to, filter = {}) => {
      const rows = await store.lesson.findMany({
        where: {
          startsAt: { gte: new Date(from.getTime() - 86_400_000), lt: to },
          status: filter.status ?? { not: 'CANCELLED' },
          ...(filter.studentId ? { students: { some: { studentId: filter.studentId } } } : {}),
          ...(filter.coachName ? { coachName: { contains: filter.coachName, mode: 'insensitive' } } : {}),
        },
        include: lessonInclude,
        orderBy: { startsAt: 'asc' },
      })
      return rows.filter(l => l.startsAt.getTime() + l.durationMin * 60_000 > from.getTime())
    },
    findById: (id) => store.lesson.findUnique({ where: { id }, include: lessonInclude }),
    findBySeries: (seriesId) =>
      store.lesson.findMany({ where: { seriesId }, include: lessonInclude, orderBy: { startsAt: 'asc' } }),
    findUpcomingByStudent: (studentId, from, limit = 20) =>
      store.lesson.findMany({
        where: {
          students: { some: { studentId } },
          startsAt: { gte: from },
          status: { not: 'CANCELLED' },
        },
        include: lessonInclude,
        orderBy: { startsAt: 'asc' },
        take: limit,
      }),
    findPastByStudent: (studentId, to, limit = 20) =>
      store.lesson.findMany({
        where: {
          students: { some: { studentId } },
          startsAt: { lte: to },
          status: { not: 'CANCELLED' },
        },
        include: lessonInclude,
        orderBy: { startsAt: 'desc' },
        take: limit,
      }),
    create: async ({ studentIds, ...data }) => {
      const lesson = await store.lesson.create({
        data: {
          ...data,
          students: { create: studentIds.map((studentId) => ({ studentId })) },
        },
        include: lessonInclude,
      })
      return lesson
    },
    update: async (id, data, version) => {
      const changed = await store.lesson.updateMany({ where: { id, ...(version === undefined ? {} : { version }) }, data: { ...data, ...((!Object.keys(data).length || Object.keys(data).some(k => !['googleEventId', 'googleCalendarId', 'materializedUntil'].includes(k))) ? { version: { increment: 1 } } : {}) } })
      if (!changed.count) fail('LESSON_CONFLICT')
      return (await store.lesson.findUniqueOrThrow({ where: { id }, include: lessonInclude }))
    },
    replaceStudents: async (id, studentIds) => {
      await store.lessonStudent.deleteMany({ where: { lessonId: id, studentId: { notIn: studentIds } } })
      await store.lessonStudent.createMany({ data: studentIds.map(studentId => ({ lessonId: id, studentId })), skipDuplicates: true })
    },
    cancel: (id) =>
      store.lesson.update({ where: { id }, data: { status: 'CANCELLED', version: { increment: 1 } }, include: lessonInclude }),
    setGoogleEventId: async (id, googleEventId) => {
      await store.lesson.update({ where: { id }, data: { googleEventId } })
    },
    deleteFutureBySeries: async (seriesId, from) => {
      const result = await store.lesson.updateMany({
        where: { seriesId, startsAt: { gte: from }, status: { not: 'CANCELLED' } },
        data: { status: 'CANCELLED' },
      })
      return result.count
    },
    countLessonsByStudent: (studentId) =>
      store.lessonStudent.count({ where: { studentId } }),
    upsertAttendance: async ({ lessonId, studentId, status, note }) => {
      await store.lessonStudent.upsert({
        where: { lessonId_studentId: { lessonId, studentId } },
        create: { lessonId, studentId, status, note },
        update: { status, ...(note !== undefined ? { note } : {}) },
      })
    },
    setPackage: async ({ lessonId, studentId, packageId }) => {
      await store.lessonStudent.update({
        where: { lessonId_studentId: { lessonId, studentId } },
        data: { packageId },
      })
    },
  }
}

export function createLessonSeriesRepository(store: StudentStore): LessonSeriesRepository {
  return {
    findById: (id) => store.lessonSeries.findUnique({ where: { id }, include: { students: true } }),
    findMany: () => store.lessonSeries.findMany({ orderBy: { startsOn: 'asc' }, include: { students: true } }),
    create: ({ studentIds, ...data }) => store.lessonSeries.create({ data: { ...data, students: { create: studentIds.map(studentId => ({ studentId })) } }, include: { students: true } }),
    update: async (id, data, version) => {
      const changed = await store.lessonSeries.updateMany({ where: { id, ...(version === undefined ? {} : { version }) }, data: { ...data, ...((!Object.keys(data).length || Object.keys(data).some(k => !['googleEventId', 'googleCalendarId', 'materializedUntil'].includes(k))) ? { version: { increment: 1 } } : {}) } })
      if (!changed.count) fail('LESSON_CONFLICT')
      return store.lessonSeries.findUniqueOrThrow({ where: { id }, include: { students: true } })
    },
    replaceStudents: async (seriesId, studentIds) => {
      await store.lessonSeriesStudent.deleteMany({ where: { seriesId } })
      await store.lessonSeriesStudent.createMany({ data: studentIds.map(studentId => ({ seriesId, studentId })) })
    },
    delete: async (id) => {
      await store.lessonSeries.delete({ where: { id } })
    },
  }
}

export function createLessonPackageRepository(store: StudentStore): LessonPackageRepository {
  return {
    findById: (id) => store.lessonPackage.findUnique({ where: { id } }),
    findActiveByStudent: (studentId) =>
      store.lessonPackage.findMany({ where: { studentId, isActive: true }, orderBy: { createdAt: 'asc' } }),
    create: (data) => store.lessonPackage.create({ data }),
    update: (id, data) => store.lessonPackage.update({ where: { id }, data }),
    incrementUsed: async (id) => {
      const pkg = await store.lessonPackage.findUnique({ where: { id } })
      if (!pkg) throw new Error('LESSON_PACKAGE_NOT_FOUND')
      if (pkg.used >= pkg.total) return pkg
      return store.lessonPackage.update({
        where: { id },
        data: { used: { increment: 1 } },
      })
    },
  }
}

export function createCalendarConnectionRepository(
  store: StudentStore
): CalendarConnectionRepository {
  return {
    find: () => store.calendarConnection.findFirst({ orderBy: { connectedAt: 'desc' } }),
    upsert: (data) =>
      store.calendarConnection.upsert({
        where: { id: 'single' },
        create: { ...data, id: 'single' },
        update: data,
      }),
    updateToken: async (id, data, generation) => {
      const updated = await store.calendarConnection.updateMany({ where: { id, ...(generation ? { generation } : {}) }, data })
      if (!updated.count) fail('CALENDAR_BUSY')
      return store.calendarConnection.findUniqueOrThrow({ where: { id } })
    },
    delete: async (id) => {
      await store.calendarConnection.delete({ where: { id } })
    },
  }
}

export function createCalendarSyncRepository(store: StudentStore): CalendarSyncRepository {
  return {
    summary: async () => {
      const [pending, failed, last] = await Promise.all([
        store.calendarSyncJob.count({ where: { status: 'PENDING' } }),
        store.calendarSyncJob.count({ where: { status: 'ERROR' } }),
        store.calendarSyncJob.aggregate({ _max: { syncedAt: true } }),
      ])
      return { pending, failed, lastSyncedAt: last._max.syncedAt }
    },
    getMapping: async (entityKey, calendarId) => (await store.calendarEventMapping.findUnique({ where: { entityKey_calendarId: { entityKey, calendarId } } }))?.eventId ?? null,
    setMapping: async (entityKey, calendarId, eventId) => { await store.calendarEventMapping.upsert({ where: { entityKey_calendarId: { entityKey, calendarId } }, create: { entityKey, calendarId, eventId }, update: { eventId } }) },
    remapPrimary: async (calendarId) => {
      const old = await store.calendarEventMapping.findMany({ where: { calendarId: 'primary' } })
      for (const mapping of old) await store.calendarEventMapping.upsert({ where: { entityKey_calendarId: { entityKey: mapping.entityKey, calendarId } }, create: { entityKey: mapping.entityKey, calendarId, eventId: mapping.eventId }, update: {} })
    },
    enqueue: async (kind, entityId) => {
      const entityKey = `${kind}:${entityId}`
      await store.calendarSyncJob.upsert({
        where: { entityKey },
        create: { entityKey, entityId, kind },
        update: { version: { increment: 1 }, status: 'PENDING', attempts: 0, lastError: null, nextAttemptAt: new Date() },
      })
    },
    pending: () => store.calendarSyncJob.findMany({ where: { status: 'PENDING', nextAttemptAt: { lte: new Date() } }, orderBy: [{ kind: 'desc' }, { updatedAt: 'asc' }], take: 10 }),
    list: (entityIds) => store.calendarSyncJob.findMany({ where: entityIds ? { entityId: { in: entityIds } } : { status: { not: 'SYNCED' } }, orderBy: { updatedAt: 'desc' }, take: 500 }),
    finish: async (id, version, error) => {
      await store.calendarSyncJob.updateMany({ where: { id, version }, data: error ? {
        status: error.retry ? 'PENDING' : 'ERROR', lastError: error.message, attempts: { increment: 1 },
        nextAttemptAt: new Date(Date.now() + Math.min(3_600_000, 30_000 * 2 ** Math.min(error.attempts, 7))),
      } : { status: 'SYNCED', syncedAt: new Date(), lastError: null } })
    },
    retry: async () => { await store.calendarSyncJob.updateMany({ where: { status: { not: 'SYNCED' } }, data: { status: 'PENDING', nextAttemptAt: new Date(), attempts: 0, lastError: null } }) },
    acquire: async (owner) => (await store.calendarConnection.updateMany({ where: { id: 'single', OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }] }, data: { leaseOwner: owner, leaseUntil: new Date(Date.now() + 90_000) } })).count === 1,
    release: async (owner) => { await store.calendarConnection.updateMany({ where: { id: 'single', leaseOwner: owner }, data: { leaseOwner: null, leaseUntil: null } }) },
    reconnectRequired: async () => { await store.calendarConnection.updateMany({ data: { needsReconnect: true } }) },
  }
}
