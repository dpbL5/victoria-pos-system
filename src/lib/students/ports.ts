// ── Ports — repository interfaces cho domain Học viên ─────
import type { Prisma } from '@/generated/prisma/client'
import type { PreviousAttendanceNote } from './helpers/attendance-notes'

export type StudentRecord = Prisma.StudentGetPayload<{
  include: { classMemberships: { include: { lessonClass: true } } }
}>
export type LessonRecord = Prisma.LessonGetPayload<{
  include: { students: { include: { student: true } }; series: { include: { class: true } }; class: true }
}>
export type LessonSeriesRecord = Prisma.LessonSeriesGetPayload<{ include: { students: true } }>
export type CalendarConnectionRecord = Prisma.CalendarConnectionGetPayload<object>
export type LessonClassRecord = Prisma.LessonClassGetPayload<{
  include: { slots: { include: { students: { include: { student: true } } } }; students: { include: { student: true } }; _count: { select: { lessons: true } } }
}>

export interface StudentListInput {
  search?: string
  status?: 'ACTIVE' | 'INACTIVE'
  limit?: number
  offset?: number
  /** Chỉ trả học viên chưa thuộc lớp nào (hoặc đang ở đúng lớp này) — dùng cho sổ lớp. */
  availableForClassId?: string
  /** Chỉ trả học viên chưa thuộc lớp nào — dùng khi tạo lớp mới. */
  unassigned?: boolean
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
  findManyBetween(from: Date, to: Date, filter?: { studentId?: string; coachName?: string; status?: 'SCHEDULED' | 'COMPLETED' | 'CANCELLED'; classId?: string }): Promise<LessonRecord[]>
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
  /** Mọi buổi của một lớp (buổi lẻ gắn lớp + buổi sinh từ khung của lớp), không lọc theo thời gian. */
  findByClass(classId: string): Promise<LessonRecord[]>
  /** Xoá cứng (chỉ dùng cho lớp thêm nhầm — chưa có buổi điểm danh). */
  deleteMany(ids: string[]): Promise<number>
  /** Cập nhật status/note cho LessonStudent (điểm danh). */
  upsertAttendance(input: {
    lessonId: string
    studentId: string
    status: 'COMPLETED' | 'ABSENT' | 'SCHEDULED'
    note?: string
  }): Promise<void>
  /** Ghi note riêng của một học viên cho buổi học (không đụng status). */
  setStudentNote(input: { lessonId: string; studentId: string; note: string | null }): Promise<void>
  /** Note khác rỗng của buổi gần nhất trước `before` cho từng học viên. */
  lastNotesByStudent(studentIds: string[], before: Date): Promise<PreviousAttendanceNote[]>
}

export interface LessonSeriesRepository {
  findById(id: string): Promise<LessonSeriesRecord | null>
  findMany(): Promise<LessonSeriesRecord[]>
  create(data: Omit<Prisma.LessonSeriesUncheckedCreateInput, 'students'> & { studentIds: string[] }): Promise<LessonSeriesRecord>
  update(id: string, data: Prisma.LessonSeriesUncheckedUpdateInput, version?: number): Promise<LessonSeriesRecord>
  replaceStudents(id: string, studentIds: string[]): Promise<void>
  delete(id: string): Promise<void>
}

export interface LessonClassRepository {
  findMany(filter?: { status?: 'ACTIVE' | 'ENDED'; search?: string }): Promise<LessonClassRecord[]>
  findById(id: string): Promise<LessonClassRecord | null>
  create(data: { name: string; coachName?: string | null; note?: string | null }): Promise<LessonClassRecord>
  replaceStudents(classId: string, studentIds: string[]): Promise<void>
  update(id: string, data: { name?: string; coachName?: string | null; note?: string | null; isActive?: boolean }): Promise<LessonClassRecord>
  delete(id: string): Promise<void>
  /** Buổi sắp tới của nhiều lớp (đã sắp theo startsAt) — gom theo lớp ở tầng gọi. */
  findUpcomingLessons(classIds: string[], from: Date): Promise<LessonRecord[]>
  /** Lớp hiện tại của từng học viên — ràng buộc "một học viên chỉ thuộc một lớp". */
  classesOfStudents(studentIds: string[], activeOnly?: boolean): Promise<{ studentId: string; studentName: string; classId: string; className: string }[]>
}

export interface CalendarConnectionRepository {
  findByUser(userId: string): Promise<CalendarConnectionRecord | null>
  findById(id: string): Promise<CalendarConnectionRecord | null>
  /** Mọi connection đã chọn lịch đích và không cần kết nối lại — dùng cho cron dọn dẹp. */
  listReady(): Promise<CalendarConnectionRecord[]>
  upsertForUser(userId: string, data: {
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
  summary(connectionId: string): Promise<{ pending: number; failed: number; lastSyncedAt: Date | null }>
  getMapping(entityKey: string, calendarId: string): Promise<string | null>
  setMapping(entityKey: string, calendarId: string, eventId: string): Promise<void>
  remapPrimary(calendarId: string): Promise<void>
  /**
   * Đánh dấu "cần đồng bộ" cho MỖI connection đã chọn lịch đích (fan-out 1 job/connection).
   * Không gọi Google — chỉ đẩy lên khi admin bấm đồng bộ.
   */
  enqueue(kind: 'LESSON' | 'SERIES', entityId: string): Promise<void>
  pending(connectionId: string): Promise<CalendarSyncJobRecord[]>
  list(connectionId: string, entityIds?: string[]): Promise<CalendarSyncJobRecord[]>
  finish(id: string, version: number, error?: { message: string; retry: boolean; attempts: number }): Promise<void>
  retry(connectionId: string): Promise<void>
  acquire(connectionId: string, owner: string): Promise<boolean>
  release(connectionId: string, owner: string): Promise<void>
  reconnectRequired(connectionId: string): Promise<void>
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
