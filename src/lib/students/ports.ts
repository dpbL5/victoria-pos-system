// ── Ports — repository interfaces cho domain Học viên ─────
import type { Prisma } from '@/generated/prisma/client'

export type StudentRecord = Prisma.StudentGetPayload<{ include: { packages: true } }>
export type LessonRecord = Prisma.LessonGetPayload<{
  include: { students: { include: { student: true; package: true } }; series: true }
}>
export type LessonSeriesRecord = Prisma.LessonSeriesGetPayload<object>
export type LessonPackageRecord = Prisma.LessonPackageGetPayload<object>
export type CalendarConnectionRecord = Prisma.CalendarConnectionGetPayload<object>

export interface StudentListInput {
  search?: string
  status?: 'ACTIVE' | 'INACTIVE'
  limit?: number
}

export interface StudentRepository {
  findMany(input?: StudentListInput): Promise<StudentRecord[]>
  findById(id: string): Promise<StudentRecord | null>
  findByIdIncludingDeleted(id: string): Promise<StudentRecord | null>
  create(data: {
    fullName: string
    phone?: string
    birthYear?: number
    notes?: string
  }): Promise<StudentRecord>
  update(
    id: string,
    data: { fullName?: string; phone?: string; birthYear?: number | null; notes?: string; status?: 'ACTIVE' | 'INACTIVE' }
  ): Promise<StudentRecord>
  softDelete(id: string): Promise<StudentRecord>
}

export interface LessonRepository {
  findManyBetween(from: Date, to: Date): Promise<LessonRecord[]>
  findById(id: string): Promise<LessonRecord | null>
  findBySeries(seriesId: string): Promise<LessonRecord[]>
  findUpcomingByStudent(studentId: string, from: Date, limit?: number): Promise<LessonRecord[]>
  findPastByStudent(studentId: string, to: Date, limit?: number): Promise<LessonRecord[]>
  create(data: {
    title: string
    coachName?: string
    startsAt: Date
    durationMin: number
    seriesId?: string
    studentIds: string[]
    note?: string
    googleEventId?: string
  }): Promise<LessonRecord>
  update(id: string, data: { title?: string; coachName?: string; startsAt?: Date; durationMin?: number; note?: string; googleEventId?: string | null }): Promise<LessonRecord>
  cancel(id: string): Promise<LessonRecord>
  setGoogleEventId(id: string, googleEventId: string): Promise<void>
  /** Xoá buổi tương lai của series (khi xoá series) — trả về số buổi đã xoá */
  deleteFutureBySeries(seriesId: string, from: Date): Promise<number>
  countLessonsByStudent(studentId: string): Promise<number>
  /** Cập nhật status/note cho LessonStudent (điểm danh). */
  upsertAttendance(input: {
    lessonId: string
    studentId: string
    status: 'COMPLETED' | 'ABSENT' | 'SCHEDULED'
    note?: string
  }): Promise<void>
  /** Gắn gói buổi đã bị trừ cho LessonStudent (chống đếm trùng). */
  setPackage(input: { lessonId: string; studentId: string; packageId: string }): Promise<void>
}

export interface LessonSeriesRepository {
  findById(id: string): Promise<LessonSeriesRecord | null>
  findMany(): Promise<LessonSeriesRecord[]>
  create(data: {
    title: string
    coachName?: string
    daysOfWeek: number[]
    startTime: string
    durationMin: number
    rrule: string
    startsOn: Date
    endsOn?: Date
    googleEventId?: string
  }): Promise<LessonSeriesRecord>
  update(id: string, data: { title?: string; coachName?: string; daysOfWeek?: number[]; startTime?: string; durationMin?: number; startsOn?: Date; endsOn?: Date | null; isActive?: boolean; googleEventId?: string | null }): Promise<LessonSeriesRecord>
  delete(id: string): Promise<void>
}

export interface LessonPackageRepository {
  findById(id: string): Promise<LessonPackageRecord | null>
  findActiveByStudent(studentId: string): Promise<LessonPackageRecord[]>
  create(data: { studentId: string; name: string; total: number }): Promise<LessonPackageRecord>
  update(id: string, data: { name?: string; total?: number; isActive?: boolean }): Promise<LessonPackageRecord>
  /** Tăng used thêm 1 (điều kiện: còn buổi, tức used < total) */
  incrementUsed(id: string): Promise<LessonPackageRecord>
}

export interface CalendarConnectionRepository {
  find(): Promise<CalendarConnectionRecord | null>
  upsert(data: {
    email: string
    accessToken: string
    refreshToken: string
    tokenExpiresAt: Date
    calendarId?: string | null
  }): Promise<CalendarConnectionRecord>
  updateToken(
    id: string,
    data: { accessToken: string; refreshToken: string; tokenExpiresAt: Date }
  ): Promise<CalendarConnectionRecord>
  delete(id: string): Promise<void>
}
