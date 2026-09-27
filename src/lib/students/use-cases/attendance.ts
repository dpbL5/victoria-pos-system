// ── Use-case: điểm danh buổi học ─────
import { err, ok } from '@/lib/shared/result'
import type { DomainError, Result } from '@/lib/shared/result'
import { fail, runInTransaction } from '@/lib/infrastructure/db-helpers'
import type { HttpErrorInfo } from '@/lib/infrastructure/api-helpers'
import type { Repositories } from '@/lib/infrastructure/repositories'
import { repositories } from '@/lib/infrastructure/repositories'
import type { PreviousAttendanceNote } from '../helpers/attendance-notes'
import type { LessonRecord } from '../ports'

export interface AttendanceEntry {
  studentId: string
  status: 'COMPLETED' | 'ABSENT' | 'SCHEDULED'
  note?: string
}

export interface MarkAttendanceInput {
  staffId: string
  lessonId: string
  version: number
  entries: AttendanceEntry[]
}

export interface MarkAttendanceResult {
  lesson: LessonRecord
}

export async function markAttendance(
  input: MarkAttendanceInput,
  deps: Repositories = repositories
): Promise<Result<MarkAttendanceResult>> {
  const lesson = await deps.lesson.findById(input.lessonId)
  if (!lesson) return err('LESSON_NOT_FOUND')

  // Validate: các entry phải thuộc buổi học này
  const lessonStudentIds = new Set(lesson.students.map((ls) => ls.studentId))
  for (const e of input.entries) {
    if (!lessonStudentIds.has(e.studentId)) return err('LESSON_STUDENT_MISMATCH')
  }

  const result = await runInTransaction(async (tx) => {
    const current = await tx.lesson.findById(input.lessonId)
    if (!current || current.status === 'CANCELLED') fail('LESSON_CANCELLED')
    if (current.version !== input.version) fail('LESSON_CONFLICT')
    if (current.startsAt.getTime() + current.durationMin * 60_000 > Date.now()) fail('LESSON_NOT_FINISHED')
    if (input.entries.some(e => !current!.students.some(s => s.studentId === e.studentId))) fail('LESSON_STUDENT_MISMATCH')
    for (const e of input.entries) {
      const ls = current!.students.find((s) => s.studentId === e.studentId)
      if (!ls) continue
      await tx.lesson.upsertAttendance({
        lessonId: input.lessonId,
        studentId: e.studentId,
        status: e.status,
        note: e.note === undefined ? undefined : e.note.trim(),
      })
    }

    // Cập nhật note cấp buổi (không — note cấp buổi ở lesson, note HV ở LessonStudent)
    await tx.audit.append({
      userId: input.staffId,
      action: 'LESSON_ATTENDANCE',
      entityType: 'Lesson',
      entityId: input.lessonId,
      details: {
        entries: input.entries.map((e) => ({ studentId: e.studentId, status: e.status })),
      },
    })

    const statuses = current!.students.map(s => input.entries.find(e => e.studentId === s.studentId)?.status ?? s.status)
    await tx.lesson.update(input.lessonId, { status: statuses.every(status => status !== 'SCHEDULED') ? 'COMPLETED' : 'SCHEDULED' }, input.version)
    const updated = await tx.lesson.findById(input.lessonId)
    return { lesson: updated! }
  }, { isolationLevel: 'Serializable' }).catch(error => {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2034') return err('LESSON_CONFLICT')
    throw error
  })

  return result
}

export interface PreviousNotesResult {
  notes: PreviousAttendanceNote[]
}

/** Note của buổi gần nhất trước buổi này cho từng học viên trong buổi — hiển thị khi điểm danh. */
export async function previousAttendanceNotes(
  input: { lessonId: string },
  deps: Repositories = repositories
): Promise<Result<PreviousNotesResult>> {
  const lesson = await deps.lesson.findById(input.lessonId)
  if (!lesson) return err('LESSON_NOT_FOUND')
  const notes = await deps.lesson.lastNotesByStudent(lesson.students.map(s => s.studentId), lesson.startsAt)
  return ok({ notes })
}

export interface UpdateLessonNotesInput {
  staffId: string
  lessonId: string
  version: number
  entries: { studentId: string; note: string }[]
}

export interface UpdateLessonNotesResult {
  lesson: LessonRecord
}

/** Ghi note riêng từng học viên cho buổi học — không điểm danh hoặc đổi status buổi. */
export async function updateLessonStudentNotes(
  input: UpdateLessonNotesInput,
  deps: Repositories = repositories
): Promise<Result<UpdateLessonNotesResult>> {
  const lesson = await deps.lesson.findById(input.lessonId)
  if (!lesson) return err('LESSON_NOT_FOUND')

  const lessonStudentIds = new Set(lesson.students.map((ls) => ls.studentId))
  for (const e of input.entries) {
    if (!lessonStudentIds.has(e.studentId)) return err('LESSON_STUDENT_MISMATCH')
  }

  const result = await runInTransaction(async (tx) => {
    const current = await tx.lesson.findById(input.lessonId)
    if (!current || current.status === 'CANCELLED') fail('LESSON_CANCELLED')
    if (current.version !== input.version) fail('LESSON_CONFLICT')
    if (input.entries.some(e => !current!.students.some(s => s.studentId === e.studentId))) fail('LESSON_STUDENT_MISMATCH')

    for (const e of input.entries) {
      const note = e.note.trim()
      await tx.lesson.setStudentNote({
        lessonId: input.lessonId,
        studentId: e.studentId,
        note: note === '' ? null : note,
      })
    }

    await tx.lesson.update(current.id, { status: current.status }, input.version)

    await tx.audit.append({
      userId: input.staffId,
      action: 'LESSON_STUDENT_NOTE',
      entityType: 'Lesson',
      entityId: input.lessonId,
      details: { entries: input.entries.map((e) => ({ studentId: e.studentId })) },
    })

    const updated = await tx.lesson.findById(input.lessonId)
    return { lesson: updated! }
  }, { isolationLevel: 'Serializable' }).catch(error => {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2034') return err('LESSON_CONFLICT')
    throw error
  })

  return result
}

export function mapLessonNotesError(error: DomainError): HttpErrorInfo {
  switch (error.code) {
    case 'LESSON_CANCELLED':
      return { code: error.code, message: 'Buổi học đã huỷ, không thể ghi chú', status: 409 }
    case 'LESSON_NOT_FOUND':
      return { code: 'LESSON_NOT_FOUND', message: 'Không tìm thấy buổi học', status: 404 }
    case 'LESSON_STUDENT_MISMATCH':
      return { code: 'LESSON_STUDENT_MISMATCH', message: 'Có học viên không thuộc buổi học này', status: 400 }
    case 'LESSON_CONFLICT':
      return { code: error.code, message: 'Buổi học đã được cập nhật ở nơi khác. Hãy tải lại và lưu lại ghi chú', status: 409 }
    default:
      return { code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 }
  }
}

export function mapMarkAttendanceError(error: DomainError): HttpErrorInfo {
  switch (error.code) {
    case 'LESSON_CANCELLED':
      return { code: error.code, message: 'Buổi học đã huỷ, không thể điểm danh', status: 409 }
    case 'LESSON_NOT_FOUND':
      return { code: 'LESSON_NOT_FOUND', message: 'Không tìm thấy buổi học', status: 404 }
    case 'LESSON_STUDENT_MISMATCH':
      return { code: 'LESSON_STUDENT_MISMATCH', message: 'Có học viên không thuộc buổi học này', status: 400 }
    case 'LESSON_CONFLICT':
      return { code: error.code, message: 'Buổi học đã được cập nhật ở nơi khác. Hãy tải lại trước khi điểm danh', status: 409 }
    case 'LESSON_NOT_FINISHED':
      return { code: error.code, message: 'Chỉ có thể điểm danh sau khi buổi học kết thúc', status: 409 }
    default:
      return { code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 }
  }
}
