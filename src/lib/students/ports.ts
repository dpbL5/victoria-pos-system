// ── Ports — repository interfaces cho domain Học viên ─────
import type { Prisma } from '@/generated/prisma/client'

export type StudentRecord = Prisma.StudentGetPayload<{ include: { packages: true } }>
export type LessonRecord = Prisma.LessonGetPayload<{
  include: { students: { include: { student: true; package: true } }; series: true }
}>
export type LessonSeriesRecord = Prisma.LessonSeriesGetPayload<{ include: { students: true } }>
export type LessonPackageRecord = Prisma.LessonPackageGetPayload<object>
export type CalendarConnectionRecord = Prisma.CalendarConnectionGetPayload<object>

export interface StudentListInput {
  search?: string
  status?: 'ACTIVE' | 'INACTIVE'
  limit?: number
  offset?: number
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
  findManyBetween(from: Date, to: Date, filter?: { studentId?: string; coachName?: string; status?: 'SCHEDULED' | 'COMPLETED' | 'CANCELLED' }): Promise<LessonRecord[]>
  findById(id: string): Promise<LessonRecord | null>
  findBySeries(seriesId: string): Promise<LessonRecord[]>
  findUpcomingByStudent(studentId: string, from: Date, limit?: number): Promise<LessonRecord[]>
  findPastByStudent(studentId: string, to: Date, limit?: number): Promise<LessonRecord[]>
  create(data: Omit<Prisma.LessonUncheckedCreateInput, 'students'> & { studentIds: string[] }): Promise<LessonRecord>
  update(id: string, data: Prisma.LessonUncheckedUpdateInput, version?: number): Promise<LessonRecord>
  replaceStudents(id: string, studentIds: string[]): Promise<void>
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
  create(data: Omit<Prisma.LessonSeriesUncheckedCreateInput, 'students'> & { studentIds: string[] }): Promise<LessonSeriesRecord>
  update(id: string, data: Prisma.LessonSeriesUncheckedUpdateInput, version?: number): Promise<LessonSeriesRecord>
  replaceStudents(id: string, studentIds: string[]): Promise<void>
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
    generation?: string
    needsReconnect?: boolean
  }): Promise<CalendarConnectionRecord>
  updateToken(
    id: string,
    data: { accessToken: string; refreshToken: string; tokenExpiresAt: Date },
    generation?: string
  ): Promise<CalendarConnectionRecord>
  delete(id: string): Promise<void>
}

export type CalendarSyncJobRecord = Prisma.CalendarSyncJobGetPayload<object>
export interface CalendarSyncRepository {
  summary(): Promise<{ pending: number; failed: number; lastSyncedAt: Date | null }>
  getMapping(entityKey: string, calendarId: string): Promise<string | null>
  setMapping(entityKey: string, calendarId: string, eventId: string): Promise<void>
  remapPrimary(calendarId: string): Promise<void>
  enqueue(kind: 'LESSON' | 'SERIES', entityId: string): Promise<void>
  pending(): Promise<CalendarSyncJobRecord[]>
  list(entityIds?: string[]): Promise<CalendarSyncJobRecord[]>
  finish(id: string, version: number, error?: { message: string; retry: boolean; attempts: number }): Promise<void>
  retry(): Promise<void>
  acquire(owner: string): Promise<boolean>
  release(owner: string): Promise<void>
  reconnectRequired(): Promise<void>
}

export interface GoogleCalendarPort {
  exchangeCode(code: string): Promise<{ access_token: string; refresh_token?: string; expires_in: number }>
  refresh(refreshToken: string): Promise<{ access_token: string; refresh_token?: string; expires_in: number }>
  encrypt(value: string): string
  decrypt(value: string): string
  listCalendars(token: string): Promise<{ id: string; summary: string; accessRole: string; primary?: boolean }[]>
  putEvent(token: string, calendarId: string, id: string, body: Record<string, unknown>): Promise<string>
  deleteEvent(token: string, calendarId: string, id: string): Promise<void>
  instance(token: string, calendarId: string, masterId: string, originalStartAt: Date): Promise<string>
}
