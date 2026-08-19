// ── Adapter: implement các repository của domain Học viên bằng Prisma ─────
import type { Prisma } from '@/generated/prisma/client'
import type {
  StudentRepository,
  LessonRepository,
  LessonSeriesRepository,
  LessonPackageRepository,
  CalendarConnectionRepository,
} from '@/lib/students'

type StudentStore = Pick<
  Prisma.TransactionClient,
  | 'student'
  | 'lesson'
  | 'lessonSeries'
  | 'lessonPackage'
  | 'lessonStudent'
  | 'calendarConnection'
>

const lessonInclude = {
  students: { include: { student: true, package: true } },
  series: true,
} as const

const studentInclude = { packages: true } as const

export function createStudentRepository(store: StudentStore): StudentRepository {
  return {
    findMany: ({ search, status, limit } = {}) =>
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
    findManyBetween: (from, to) =>
      store.lesson.findMany({
        where: { startsAt: { gte: from, lte: to }, status: { not: 'CANCELLED' } },
        include: lessonInclude,
        orderBy: { startsAt: 'asc' },
      }),
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
    update: (id, data) => store.lesson.update({ where: { id }, data, include: lessonInclude }),
    cancel: (id) =>
      store.lesson.update({ where: { id }, data: { status: 'CANCELLED' }, include: lessonInclude }),
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
    findById: (id) => store.lessonSeries.findUnique({ where: { id } }),
    findMany: () => store.lessonSeries.findMany({ orderBy: { startsOn: 'asc' } }),
    create: (data) => store.lessonSeries.create({ data }),
    update: (id, data) => store.lessonSeries.update({ where: { id }, data }),
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
    updateToken: (id, data) => store.calendarConnection.update({ where: { id }, data }),
    delete: async (id) => {
      await store.calendarConnection.delete({ where: { id } })
    },
  }
}
