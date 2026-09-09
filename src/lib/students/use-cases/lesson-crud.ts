import { parseLocalDate, toInputDate } from '@/lib/shared/utils'
import type { DomainError } from '@/lib/shared/result'
import { fail, runInTransaction } from '@/lib/infrastructure/db-helpers'
import type { HttpErrorInfo } from '@/lib/infrastructure/api-helpers'
import { repositories, type Repositories } from '@/lib/infrastructure/repositories'
import type { LessonRecord, LessonSeriesRecord } from '../ports'
import { DAY_MS, lessonEnd, overlaps, SERIES_HORIZON_DAYS, weeklyOccurrences, weeklyRrule } from '../helpers/calendar'

const isolation = { isolationLevel: 'Serializable', timeout: 30000 } as const
export const isLessonLocked = (lesson: Pick<LessonRecord, 'students' | 'status'>) => lesson.status === 'COMPLETED' || lesson.students.some(s => s.status !== 'SCHEDULED' || s.packageId)

async function studentsActive(tx: Repositories, ids: string[]) {
  if (!ids.length || new Set(ids).size !== ids.length) fail('LESSON_NO_STUDENTS')
  for (const id of ids) {
    const student = await tx.student.findById(id)
    if (!student || student.status !== 'ACTIVE') fail('STUDENT_INACTIVE')
  }
}

/** Kiểm tra cả buổi đã sinh và lịch tuần chưa sinh trong khoảng đang đặt. */
async function available(tx: Repositories, input: { startsAt: Date; durationMin: number; studentIds: string[] }, exclude: string[] = [], excludeSeries?: string) {
  const rows = await tx.lesson.findManyBetween(input.startsAt, lessonEnd(input))
  if (rows.some(row => !exclude.includes(row.id) && overlaps(input, row) && row.students.some(s => input.studentIds.includes(s.studentId)))) fail('LESSON_OVERLAP')
  for (const series of await tx.lessonSeries.findMany()) {
    if (!series.isActive || series.id === excludeSeries || !series.students.some(s => input.studentIds.includes(s.studentId))) continue
    const occurrences = weeklyOccurrences(series, new Date(input.startsAt.getTime() - DAY_MS), lessonEnd(input))
    if (!occurrences.length) continue
    const concrete = await tx.lesson.findBySeries(series.id)
    for (const startsAt of occurrences) {
      if (concrete.some(l => l.originalStartAt?.getTime() === startsAt.getTime())) continue
      if (overlaps(input, { startsAt, durationMin: series.durationMin })) fail('LESSON_OVERLAP')
    }
  }
}

/** Lịch tuần lặp lại sau BCNN hai chu kỳ; kiểm tra cả tương lai chưa sinh. */
async function seriesAvailable(tx: Repositories, candidate: LessonSeriesRecord, ignored: string[] = []) {
  const ids = candidate.students.map(s => s.studentId)
  const concrete = await tx.lesson.findBySeries(candidate.id)
  const replaced = new Set(concrete.map(l => l.originalStartAt?.getTime()))
  const future = await tx.lesson.findManyBetween(new Date(candidate.startsOn.getTime() - DAY_MS), new Date('9999-01-01T00:00:00Z'))
  for (const other of future) {
    if (other.seriesId === candidate.id || ignored.includes(other.id) || !other.students.some(s => ids.includes(s.studentId))) continue
    const dates = weeklyOccurrences(candidate, new Date(other.startsAt.getTime() - DAY_MS), lessonEnd(other))
    if (dates.some(startsAt => !replaced.has(startsAt.getTime()) && overlaps({ startsAt, durationMin: candidate.durationMin }, other))) fail('LESSON_OVERLAP')
  }
  const gcd = (a: number, b: number): number => b ? gcd(b, a % b) : a
  for (const other of await tx.lessonSeries.findMany()) {
    if (!other.isActive || other.id === candidate.id || !other.students.some(s => ids.includes(s.studentId))) continue
    const otherConcrete = await tx.lesson.findBySeries(other.id)
    const otherReplaced = new Set(otherConcrete.map(l => l.originalStartAt?.getTime()))
    // Đi qua tất cả ngoại lệ đã lưu, rồi thêm một chu kỳ chung để chứng minh phần vô hạn.
    const start = Math.max(candidate.startsOn.getTime(), other.startsOn.getTime())
    const lastException = Math.max(start, ...concrete.map(l => (l.originalStartAt ?? l.startsAt).getTime()), ...otherConcrete.map(l => (l.originalStartAt ?? l.startsAt).getTime()))
    const period = candidate.intervalWeeks * other.intervalWeeks / gcd(candidate.intervalWeeks, other.intervalWeeks)
    const end = new Date(Math.min(candidate.endsOn?.getTime() ?? Infinity, other.endsOn?.getTime() ?? Infinity, lastException + (period * 7 + 2) * DAY_MS))
    const a = weeklyOccurrences(candidate, new Date(start - DAY_MS), end).filter(d => !replaced.has(d.getTime()))
    const b = weeklyOccurrences(other, new Date(start - DAY_MS), end).filter(d => !otherReplaced.has(d.getTime()))
    let j = 0
    for (const date of a) {
      while (j < b.length && b[j].getTime() + other.durationMin * 60000 <= date.getTime()) j++
      if (j < b.length && overlaps({ startsAt: date, durationMin: candidate.durationMin }, { startsAt: b[j], durationMin: other.durationMin })) fail('LESSON_OVERLAP')
    }
  }
}

export interface CreateLessonInput {
  staffId: string; title: string; coachName?: string; startsAt: Date; durationMin: number; studentIds: string[]; note?: string; shareNote?: boolean
}
export async function createLesson(input: CreateLessonInput, deps: Repositories = repositories) {
  void deps
  return runInTransaction(async tx => {
    await studentsActive(tx, input.studentIds)
    await available(tx, input)
    const { staffId, ...data } = input
    const lesson = await tx.lesson.create(data)
    await tx.calendarSync.enqueue('LESSON', lesson.id)
    await tx.audit.append({ userId: staffId, action: 'LESSON_CREATE', entityType: 'Lesson', entityId: lesson.id, details: { startsAt: lesson.startsAt.toISOString() } })
    return { lesson, googleSynced: false }
  }, isolation)
}
export interface UpdateLessonInput {
  staffId: string; lessonId: string; version: number; title?: string; coachName?: string; startsAt?: Date; durationMin?: number; studentIds?: string[]; note?: string; shareNote?: boolean
}
export async function updateLesson(input: UpdateLessonInput, deps: Repositories = repositories) {
  void deps
  return runInTransaction(async tx => {
    const existing = await tx.lesson.findById(input.lessonId)
    if (!existing) fail('LESSON_NOT_FOUND')
    if (existing!.version !== input.version) fail('LESSON_CONFLICT')
    if (existing!.status === 'CANCELLED') fail('LESSON_CANCELLED')
    const structural = (input.title !== undefined && input.title !== existing!.title) || (input.coachName !== undefined && input.coachName !== (existing!.coachName ?? '')) || (input.startsAt && input.startsAt.getTime() !== existing!.startsAt.getTime()) || (input.durationMin !== undefined && input.durationMin !== existing!.durationMin) || (input.studentIds && [...input.studentIds].sort().join() !== existing!.students.map(s => s.studentId).sort().join())
    if (structural && isLessonLocked(existing!)) fail('LESSON_LOCKED')
    const studentIds = input.studentIds ?? existing!.students.map(s => s.studentId)
    if (structural) {
      await studentsActive(tx, studentIds)
      await available(tx, { startsAt: input.startsAt ?? existing!.startsAt, durationMin: input.durationMin ?? existing!.durationMin, studentIds }, [existing!.id])
    }
    const { staffId, lessonId, version, studentIds: changedStudents, ...changes } = input
    if (changedStudents && structural) await tx.lesson.replaceStudents(lessonId, changedStudents)
    const lesson = await tx.lesson.update(lessonId, { ...changes, isException: existing!.seriesId ? true : existing!.isException }, version)
    await tx.calendarSync.enqueue('LESSON', lesson.id)
    await tx.audit.append({ userId: staffId, action: 'LESSON_UPDATE', entityType: 'Lesson', entityId: lesson.id, details: { version: lesson.version, startsAt: lesson.startsAt.toISOString(), noteChanged: input.note !== undefined } })
    return { lesson, googleSynced: false }
  }, isolation)
}
export async function deleteLesson(input: { staffId: string; lessonId: string; version: number }, deps: Repositories = repositories) {
  void deps
  return runInTransaction(async tx => {
    const lesson = await tx.lesson.findById(input.lessonId)
    if (!lesson) fail('LESSON_NOT_FOUND')
    if (isLessonLocked(lesson!)) fail('LESSON_LOCKED')
    const cancelled = await tx.lesson.update(lesson!.id, { status: 'CANCELLED', isException: Boolean(lesson!.seriesId) }, input.version)
    await tx.calendarSync.enqueue('LESSON', lesson!.id)
    await tx.audit.append({ userId: input.staffId, action: 'LESSON_DELETE', entityType: 'Lesson', entityId: lesson!.id })
    return cancelled
  }, isolation)
}

export interface CreateSeriesInput {
  staffId: string; title: string; coachName?: string; daysOfWeek: number[]; startTime: string; durationMin: number; startsOn: Date; endsOn?: Date | null; studentIds: string[]; intervalWeeks?: number; occurrenceCount?: number | null
}

async function materialize(tx: Repositories, series: LessonSeriesRecord, to: Date) {
  if (!series.isActive || !series.students.length) return 0
  const from = series.materializedUntil ?? series.startsOn
  if (from >= to) return 0
  const existing = await tx.lesson.findBySeries(series.id)
  const originals = new Set(existing.map(l => l.originalStartAt?.getTime()))
  let count = 0
  const studentIds = series.students.map(s => s.studentId)
  for (const startsAt of weeklyOccurrences(series, from, to)) {
    if (originals.has(startsAt.getTime())) continue
    await available(tx, { startsAt, durationMin: series.durationMin, studentIds }, [], series.id)
    await tx.lesson.create({ title: series.title, coachName: series.coachName, startsAt, originalStartAt: startsAt, durationMin: series.durationMin, seriesId: series.id, studentIds })
    count++
  }
  await tx.lessonSeries.update(series.id, { materializedUntil: to })
  return count
}

export async function ensureLessonsUntil(to: Date, deps: Repositories = repositories) {
  for (const series of await deps.lessonSeries.findMany()) {
    if (!series.isActive || (series.materializedUntil && series.materializedUntil >= to) || (series.endsOn && series.materializedUntil && series.materializedUntil > series.endsOn)) continue
    const result = await runInTransaction(async tx => {
      const current = await tx.lessonSeries.findById(series.id)
      if (current) await materialize(tx, current, to)
    }, isolation)
    if (!result.ok) return result
  }
  return { ok: true as const, value: undefined }
}

export async function createSeries(input: CreateSeriesInput, deps: Repositories = repositories) {
  void deps
  return runInTransaction(async tx => {
    await studentsActive(tx, input.studentIds)
    const { staffId, ...data } = input
    const schedule = { ...data, intervalWeeks: input.intervalWeeks ?? 1 }
    const first = weeklyOccurrences(schedule, input.startsOn, new Date(input.startsOn.getTime() + 90 * DAY_MS))[0]
    if (!first) fail('SERIES_NO_OCCURRENCES')
    const series = await tx.lessonSeries.create({ ...schedule, rrule: weeklyRrule(schedule) })
    await seriesAvailable(tx, series)
    const generatedCount = await materialize(tx, series, new Date(Math.max(Date.now(), input.startsOn.getTime()) + SERIES_HORIZON_DAYS * DAY_MS))
    await tx.calendarSync.enqueue('SERIES', series.id)
    await tx.audit.append({ userId: staffId, action: 'LESSON_SERIES_CREATE', entityType: 'LessonSeries', entityId: series.id, details: { generatedCount, rrule: series.rrule } })
    return { series: (await tx.lessonSeries.findById(series.id))!, generatedCount, googleSynced: false }
  }, isolation)
}

export interface UpdateSeriesInput extends Partial<Omit<CreateSeriesInput, 'staffId'>> {
  staffId: string; seriesId: string; version: number; scope: 'FOLLOWING' | 'ALL'; lessonId: string
}

/** Tách phần tương lai thành chuỗi mới để giữ lịch sử và ID/ghi chú của các buổi cũ. */
export async function updateSeries(input: UpdateSeriesInput, deps: Repositories = repositories) {
  void deps
  return runInTransaction(async tx => {
    const series = await tx.lessonSeries.findById(input.seriesId)
    const anchor = await tx.lesson.findById(input.lessonId)
    if (!series || !anchor || anchor.seriesId !== series.id) fail('SERIES_NOT_FOUND')
    if (series!.version !== input.version) fail('LESSON_CONFLICT')
    const lessons = await tx.lesson.findBySeries(series!.id)
    if (anchor!.startsAt < new Date()) fail('LESSON_PAST_SERIES')
    const cutoff = input.scope === 'FOLLOWING' ? anchor!.originalStartAt ?? anchor!.startsAt : new Date()
    const affected = lessons.filter(l => (l.originalStartAt ?? l.startsAt) >= cutoff).sort((a, b) => (a.originalStartAt ?? a.startsAt).getTime() - (b.originalStartAt ?? b.startsAt).getTime())
    if (!affected.length) fail('SERIES_NO_OCCURRENCES')
    if (affected.some(l => l.status !== 'CANCELLED' && isLessonLocked(l))) fail('LESSON_LOCKED')
    const firstOriginal = new Date(Math.min(...affected.map(l => (l.originalStartAt ?? l.startsAt).getTime())))
    const patternChanges = input.daysOfWeek !== undefined || input.startTime !== undefined || input.intervalWeeks !== undefined || input.startsOn !== undefined || input.endsOn !== undefined || input.occurrenceCount !== undefined
    if (patternChanges && affected.some(l => l.isException)) fail('SERIES_HAS_EXCEPTIONS')
    const studentIds = input.studentIds ?? series!.students.map(s => s.studentId)
    await studentsActive(tx, studentIds)
    const schedule = {
      daysOfWeek: input.daysOfWeek ?? series!.daysOfWeek, startTime: input.startTime ?? series!.startTime,
      startsOn: input.startsOn ?? parseLocalDate(toInputDate(firstOriginal)), endsOn: input.endsOn !== undefined ? input.endsOn : series!.endsOn,
      intervalWeeks: input.intervalWeeks ?? series!.intervalWeeks,
      occurrenceCount: input.occurrenceCount !== undefined ? input.occurrenceCount : series!.occurrenceCount ? Math.max(1, series!.occurrenceCount - weeklyOccurrences(series!, series!.startsOn, firstOriginal).length) : null,
    }
    if (schedule.startsOn < parseLocalDate(toInputDate(firstOriginal))) fail('SERIES_INVALID_START')
    if (schedule.endsOn && schedule.endsOn < schedule.startsOn) fail('SERIES_NO_OCCURRENCES')
    // Cắt chuỗi Google cũ; lưu nguyên những buổi đã xảy ra và đã huỷ.
    const oldEnd = new Date(firstOriginal.getTime() - 1000)
    await tx.lessonSeries.update(series!.id, { endsOn: oldEnd, occurrenceCount: null, rrule: weeklyRrule({ ...series!, occurrenceCount: null, endsOn: oldEnd }), isActive: oldEnd >= series!.startsOn }, input.version)
    await tx.calendarSync.enqueue('SERIES', series!.id)
    const next = await tx.lessonSeries.create({ ...schedule, title: input.title ?? series!.title, coachName: input.coachName ?? series!.coachName, durationMin: input.durationMin ?? series!.durationMin, rrule: weeklyRrule(schedule), studentIds })
    const to = new Date(Math.max(Math.max(Date.now(), schedule.startsOn.getTime()) + SERIES_HORIZON_DAYS * DAY_MS, ...affected.map(l => (l.originalStartAt ?? l.startsAt).getTime() + DAY_MS)))
    const dates = weeklyOccurrences(schedule, schedule.startsOn, to)
    const excluded = affected.map(l => l.id)
    for (let i = 0; i < affected.length; i++) {
      const old = affected[i]
      if (!dates[i]) {
        await tx.lesson.update(old.id, { status: 'CANCELLED', isException: true }, old.version)
        await tx.calendarSync.enqueue('LESSON', old.id)
        continue
      }
      const startsAt = patternChanges ? dates[i] : old.startsAt
      if (old.status !== 'CANCELLED') await available(tx, { startsAt, durationMin: next.durationMin, studentIds }, excluded, next.id)
      await tx.lesson.replaceStudents(old.id, studentIds)
      await tx.lesson.update(old.id, { seriesId: next.id, startsAt, originalStartAt: dates[i], title: next.title, coachName: next.coachName, durationMin: next.durationMin, googleEventId: null, googleCalendarId: null }, old.version)
      if (old.note || old.isException || old.status === 'CANCELLED') await tx.calendarSync.enqueue('LESSON', old.id)
    }
    await seriesAvailable(tx, next, excluded)
    await materialize(tx, next, to)
    await tx.calendarSync.enqueue('SERIES', next.id)
    await tx.audit.append({ userId: input.staffId, action: 'LESSON_SERIES_UPDATE', entityType: 'LessonSeries', entityId: series!.id, details: { scope: input.scope, newSeriesId: next.id, affected: affected.length } })
    return { series: (await tx.lessonSeries.findById(next.id))!, affectedCount: affected.length }
  }, isolation)
}

export async function deleteSeries(input: { staffId: string; seriesId: string; version: number; scope: 'FOLLOWING' | 'ALL'; lessonId: string }, deps: Repositories = repositories) {
  void deps
  return runInTransaction(async tx => {
    const series = await tx.lessonSeries.findById(input.seriesId)
    const anchor = await tx.lesson.findById(input.lessonId)
    if (!series || !anchor || anchor.seriesId !== series.id) fail('SERIES_NOT_FOUND')
    if (series!.version !== input.version) fail('LESSON_CONFLICT')
    if (anchor!.startsAt < new Date()) fail('LESSON_PAST_SERIES')
    const cutoff = input.scope === 'FOLLOWING' ? anchor!.originalStartAt ?? anchor!.startsAt : new Date()
    const affected = (await tx.lesson.findBySeries(series!.id)).filter(l => (l.originalStartAt ?? l.startsAt) >= cutoff && l.status !== 'CANCELLED')
    if (affected.some(l => l.status !== 'CANCELLED' && isLessonLocked(l))) fail('LESSON_LOCKED')
    for (const lesson of affected) {
      await tx.lesson.update(lesson.id, { status: 'CANCELLED', isException: true }, lesson.version)
      await tx.calendarSync.enqueue('LESSON', lesson.id)
    }
    const endsOn = new Date(cutoff.getTime() - 1000)
    await tx.lessonSeries.update(series!.id, { endsOn, occurrenceCount: null, isActive: endsOn >= series!.startsOn, rrule: weeklyRrule({ ...series!, endsOn, occurrenceCount: null }) }, input.version)
    await tx.calendarSync.enqueue('SERIES', series!.id)
    await tx.audit.append({ userId: input.staffId, action: 'LESSON_SERIES_DELETE', entityType: 'LessonSeries', entityId: series!.id, details: { scope: input.scope, cancelledLessons: affected.length } })
    return { deletedId: series!.id, cancelledLessons: affected.length }
  }, isolation)
}

export function mapLessonError(error: DomainError): HttpErrorInfo {
  const errors: Record<string, [number, string]> = {
    LESSON_NO_STUDENTS: [400, 'Chọn ít nhất một học viên, không chọn trùng'],
    STUDENT_INACTIVE: [400, 'Học viên không tồn tại hoặc đã ngừng học'],
    LESSON_NOT_FOUND: [404, 'Không tìm thấy buổi học'], SERIES_NOT_FOUND: [404, 'Không tìm thấy lịch lặp'],
    LESSON_OVERLAP: [409, 'Học viên đã có buổi học trùng giờ. Hãy chọn thời gian khác'],
    LESSON_CONFLICT: [409, 'Lịch đã thay đổi. Hãy tải lại trước khi sửa'],
    LESSON_LOCKED: [409, 'Buổi đã điểm danh chỉ được sửa ghi chú. Hãy chọn các buổi chưa điểm danh'],
    LESSON_CANCELLED: [409, 'Buổi học đã huỷ'], SERIES_NO_OCCURRENCES: [400, 'Không có buổi học trong khoảng đã chọn'],
    SERIES_HAS_EXCEPTIONS: [409, 'Chuỗi có buổi đã sửa riêng. Hãy giữ quy tắc lặp và sửa từng buổi để bảo toàn các ngoại lệ'],
    LESSON_PAST_SERIES: [400, 'Chọn một buổi tương lai để thay đổi lịch lặp; lịch sử được giữ nguyên'],
    SERIES_INVALID_START: [400, 'Chuỗi mới không được bắt đầu trước buổi đang chọn'],
  }
  const [status, message] = errors[error.code] ?? [500, 'Không lưu được lịch học']
  return { code: error.code, status, message }
}
export const mapCreateLessonError = mapLessonError
export const mapUpdateLessonError = mapLessonError
export const mapDeleteLessonError = mapLessonError
export const mapCreateSeriesError = mapLessonError
export const mapDeleteSeriesError = mapLessonError

export async function previewSeriesChange(input: { seriesId: string; lessonId: string; scope: 'FOLLOWING' | 'ALL' }, deps: Repositories = repositories) {
  const anchor = await deps.lesson.findById(input.lessonId)
  if (!anchor || anchor.seriesId !== input.seriesId) return { ok: false as const, error: { code: 'SERIES_NOT_FOUND' } }
  const cutoff = input.scope === 'FOLLOWING' ? anchor.originalStartAt ?? anchor.startsAt : new Date()
  const rows = (await deps.lesson.findBySeries(input.seriesId)).filter(l => (l.originalStartAt ?? l.startsAt) >= cutoff && l.status !== 'CANCELLED')
  return { ok: true as const, value: { affected: rows.length, locked: rows.filter(isLessonLocked).length, exceptions: rows.filter(l => l.isException).length } }
}
