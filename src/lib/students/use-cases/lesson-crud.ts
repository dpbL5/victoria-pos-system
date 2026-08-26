// ── Use-cases: buổi học (lẻ) + lịch lặp (series) ─────
import { err, ok } from '@/lib/shared/result'
import type { DomainError, Result } from '@/lib/shared/result'
import { runInTransaction } from '@/lib/infrastructure/db-helpers'
import type { HttpErrorInfo } from '@/lib/infrastructure/api-helpers'
import type { Repositories } from '@/lib/infrastructure/repositories'
import { repositories } from '@/lib/infrastructure/repositories'
import { buildWeeklyRrule, generateOccurrences } from '../helpers/rrule'
import type { LessonRecord, LessonSeriesRecord } from '../ports'
import {
  syncLessonToCalendar,
  syncSeriesToCalendar,
  deleteCalendarEvent,
} from '@/lib/google'
import type { CalendarConnectionRecord } from '../ports'

// Horizon mặc định: sinh buổi trong ~12 tuần tới từ ngày bắt đầu.
const SERIES_HORIZON_DAYS = 12 * 7

/** Lấy CalendarConnection nếu có, để sync GCal best-effort. */
async function findConnection(deps: Repositories): Promise<CalendarConnectionRecord | null> {
  return deps.calendarConnection.find()
}

// ── Create buổi lẻ ──
export interface CreateLessonInput {
  staffId: string
  title: string
  coachName?: string
  startsAt: Date
  durationMin: number
  studentIds: string[]
  note?: string
}

export interface CreateLessonResult {
  lesson: LessonRecord
  googleSynced: boolean
  warning?: string
}

export async function createLesson(
  input: CreateLessonInput,
  deps: Repositories = repositories
): Promise<Result<CreateLessonResult>> {
  if (input.studentIds.length === 0) return err('LESSON_NO_STUDENTS')

  let googleEventId: string | undefined
  let warning: string | undefined
  let googleSynced = false

  // Sync GCal best-effort (đọc connection ngoài tx — không block rollback)
  const conn = await findConnection(deps)
  if (conn) {
    const sync = await syncLessonToCalendar(conn, {
      title: input.title,
      coachName: input.coachName,
      note: input.note,
      startsAt: input.startsAt,
      durationMin: input.durationMin,
    })
    if (sync.synced && sync.googleEventId) {
      googleEventId = sync.googleEventId
      googleSynced = true
    } else if (sync.warning) {
      warning = sync.warning
    }
  }

  const result = await runInTransaction(async (tx) => {
    const lesson = await tx.lesson.create({
      title: input.title.trim(),
      coachName: input.coachName?.trim() || undefined,
      startsAt: input.startsAt,
      durationMin: input.durationMin,
      note: input.note?.trim() || undefined,
      googleEventId,
      studentIds: input.studentIds,
    })

    await tx.audit.append({
      userId: input.staffId,
      action: 'LESSON_CREATE',
      entityType: 'Lesson',
      entityId: lesson.id,
      details: { title: lesson.title, startsAt: lesson.startsAt.toISOString(), studentIds: input.studentIds },
    })

    return lesson
  })

  if (!result.ok) return result
  return ok({ lesson: result.value, googleSynced, ...(warning ? { warning } : {}) })
}

// ── Update buổi lẻ ──
export interface UpdateLessonInput {
  staffId: string
  lessonId: string
  title?: string
  coachName?: string
  startsAt?: Date
  durationMin?: number
  note?: string
}

export interface UpdateLessonResult {
  lesson: LessonRecord
  googleSynced: boolean
  warning?: string
}

export async function updateLesson(
  input: UpdateLessonInput,
  deps: Repositories = repositories
): Promise<Result<UpdateLessonResult>> {
  const existing = await deps.lesson.findById(input.lessonId)
  if (!existing) return err('LESSON_NOT_FOUND')

  let warning: string | undefined
  let googleSynced = false

  const conn = await findConnection(deps)
  if (conn && existing.googleEventId) {
    const sync = await syncLessonToCalendar(conn, {
      title: input.title ?? existing.title,
      coachName: input.coachName !== undefined ? input.coachName : existing.coachName,
      note: input.note !== undefined ? input.note : existing.note,
      startsAt: input.startsAt ?? existing.startsAt,
      durationMin: input.durationMin ?? existing.durationMin,
      googleEventId: existing.googleEventId,
    })
    if (sync.synced) googleSynced = true
    else if (sync.warning) warning = sync.warning
  }

  const result = await runInTransaction(async (tx) => {
    const data: Record<string, unknown> = {}
    if (input.title !== undefined) data.title = input.title.trim()
    if (input.coachName !== undefined) data.coachName = input.coachName.trim() || null
    if (input.startsAt !== undefined) data.startsAt = input.startsAt
    if (input.durationMin !== undefined) data.durationMin = input.durationMin
    if (input.note !== undefined) data.note = input.note.trim() || null

    const lesson = await tx.lesson.update(input.lessonId, data)

    await tx.audit.append({
      userId: input.staffId,
      action: 'LESSON_UPDATE',
      entityType: 'Lesson',
      entityId: input.lessonId,
      details: { title: lesson.title, startsAt: lesson.startsAt.toISOString() },
    })

    return lesson
  })

  if (!result.ok) return result
  return ok({ lesson: result.value, googleSynced, ...(warning ? { warning } : {}) })
}

// ── Xoá (cancel) buổi lẻ ──
export interface DeleteLessonInput {
  staffId: string
  lessonId: string
}

export async function deleteLesson(
  input: DeleteLessonInput,
  deps: Repositories = repositories
): Promise<Result<LessonRecord>> {
  const existing = await deps.lesson.findById(input.lessonId)
  if (!existing) return err('LESSON_NOT_FOUND')

  const conn = await findConnection(deps)
  if (conn && existing.googleEventId && !existing.seriesId) {
    await deleteCalendarEvent(conn, existing.googleEventId)
  }

  const result = await runInTransaction(async (tx) => {
    const lesson = await tx.lesson.cancel(input.lessonId)

    await tx.audit.append({
      userId: input.staffId,
      action: 'LESSON_DELETE',
      entityType: 'Lesson',
      entityId: input.lessonId,
      details: { title: existing.title, startsAt: existing.startsAt.toISOString() },
    })

    return lesson
  })

  return result
}

// ── Create series (lịch lặp) ──
export interface CreateSeriesInput {
  staffId: string
  title: string
  coachName?: string
  daysOfWeek: number[]
  startTime: string
  durationMin: number
  startsOn: Date
  endsOn?: Date | null
  studentIds: string[]
}

export interface CreateSeriesResult {
  series: LessonSeriesRecord
  generatedCount: number
  googleSynced: boolean
  warning?: string
}

export async function createSeries(
  input: CreateSeriesInput,
  deps: Repositories = repositories
): Promise<Result<CreateSeriesResult>> {
  if (input.studentIds.length === 0) return err('LESSON_NO_STUDENTS')

  const rrule = buildWeeklyRrule(input.daysOfWeek)
  const endsOn = input.endsOn ?? new Date(input.startsOn.getTime() + SERIES_HORIZON_DAYS * 24 * 60 * 60 * 1000)
  const occurrences = generateOccurrences(input.daysOfWeek, input.startTime, input.startsOn, endsOn)
  if (occurrences.length === 0) return err('SERIES_NO_OCCURRENCES')

  // Sync recurring event GCal (best-effort) — 1 event cho cả series
  let googleEventId: string | undefined
  let warning: string | undefined
  let googleSynced = false

  const conn = await findConnection(deps)
  if (conn) {
    const sync = await syncSeriesToCalendar(conn, {
      title: input.title,
      coachName: input.coachName,
      startsAt: occurrences[0],
      durationMin: input.durationMin,
      rrule,
    })
    if (sync.synced && sync.googleEventId) {
      googleEventId = sync.googleEventId
      googleSynced = true
    } else if (sync.warning) {
      warning = sync.warning
    }
  }

  const result = await runInTransaction(async (tx) => {
    const series = await tx.lessonSeries.create({
      title: input.title.trim(),
      coachName: input.coachName?.trim() || undefined,
      daysOfWeek: input.daysOfWeek,
      startTime: input.startTime,
      durationMin: input.durationMin,
      rrule,
      startsOn: input.startsOn,
      endsOn,
      googleEventId,
    })

    // Materialize từng buổi tương lai
    for (const startsAt of occurrences) {
      await tx.lesson.create({
        title: series.title,
        coachName: series.coachName ?? undefined,
        startsAt,
        durationMin: series.durationMin,
        seriesId: series.id,
        studentIds: input.studentIds,
      })
    }

    await tx.audit.append({
      userId: input.staffId,
      action: 'LESSON_SERIES_CREATE',
      entityType: 'LessonSeries',
      entityId: series.id,
      details: { title: series.title, rrule, generatedCount: occurrences.length, studentIds: input.studentIds },
    })

    return series
  })

  if (!result.ok) return result
  return ok({
    series: result.value,
    generatedCount: occurrences.length,
    googleSynced,
    ...(warning ? { warning } : {}),
  })
}

// ── Delete series (xoá series + buổi tương lai + event GCal) ──
export interface DeleteSeriesInput {
  staffId: string
  seriesId: string
}

export async function deleteSeries(
  input: DeleteSeriesInput,
  deps: Repositories = repositories
): Promise<Result<{ deletedId: string; cancelledLessons: number }>> {
  const existing = await deps.lessonSeries.findById(input.seriesId)
  if (!existing) return err('SERIES_NOT_FOUND')

  const conn = await findConnection(deps)
  if (conn && existing.googleEventId) {
    await deleteCalendarEvent(conn, existing.googleEventId)
  }

  const result = await runInTransaction(async (tx) => {
    const cancelled = await tx.lesson.deleteFutureBySeries(input.seriesId, new Date())
    await tx.lessonSeries.delete(input.seriesId)

    await tx.audit.append({
      userId: input.staffId,
      action: 'LESSON_SERIES_DELETE',
      entityType: 'LessonSeries',
      entityId: input.seriesId,
      details: { title: existing.title, cancelledLessons: cancelled },
    })

    return { deletedId: input.seriesId, cancelledLessons: cancelled }
  })

  return result
}

// ── Error mapping ──
function mapLessonError(error: DomainError): HttpErrorInfo {
  switch (error.code) {
    case 'LESSON_NO_STUDENTS':
      return { code: 'LESSON_NO_STUDENTS', message: 'Chọn ít nhất 1 học viên', status: 400 }
    case 'LESSON_NOT_FOUND':
      return { code: 'LESSON_NOT_FOUND', message: 'Không tìm thấy buổi học', status: 404 }
    case 'SERIES_NO_OCCURRENCES':
      return { code: 'SERIES_NO_OCCURRENCES', message: 'Không có buổi học nào trong khung ngày đã chọn', status: 400 }
    case 'SERIES_NOT_FOUND':
      return { code: 'SERIES_NOT_FOUND', message: 'Không tìm thấy lịch học', status: 404 }
    default:
      return { code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 }
  }
}

export const mapCreateLessonError = mapLessonError
export const mapUpdateLessonError = mapLessonError
export const mapDeleteLessonError = mapLessonError
export const mapCreateSeriesError = mapLessonError
export const mapDeleteSeriesError = mapLessonError
