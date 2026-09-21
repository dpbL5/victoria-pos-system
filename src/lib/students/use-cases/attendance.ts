// ── Use-case: điểm danh buổi học + trừ gói buổi ─────
import { err, ok } from '@/lib/shared/result'
import type { DomainError, Result } from '@/lib/shared/result'
import { fail, runInTransaction } from '@/lib/infrastructure/db-helpers'
import type { HttpErrorInfo } from '@/lib/infrastructure/api-helpers'
import type { Repositories } from '@/lib/infrastructure/repositories'
import { repositories } from '@/lib/infrastructure/repositories'
import { pickChargeablePackage } from '../helpers/package-math'
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
  entries: AttendanceEntry[]
}

export interface MarkAttendanceResult {
  lesson: LessonRecord
  /** studentId → số buổi còn lại sau khi trừ */
  remainingByStudent: Record<string, number>
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
    if (input.entries.some(e => !current!.students.some(s => s.studentId === e.studentId))) fail('LESSON_STUDENT_MISMATCH')
    const remainingByStudent: Record<string, number> = {}

    for (const e of input.entries) {
      const ls = current!.students.find((s) => s.studentId === e.studentId)
      if (!ls) continue

      // Cập nhật status + note cho LessonStudent này
      await tx.lesson.upsertAttendance({
        lessonId: input.lessonId,
        studentId: e.studentId,
        status: e.status,
        note: e.note === undefined ? undefined : e.note.trim(),
      })

      // Khi chuyển sang COMPLETED và chưa có gói bị trừ → trừ 1 buổi từ gói
      if (e.status === 'COMPLETED' && !ls.packageId) {
        const packages = await tx.lessonPackage.findActiveByStudent(e.studentId)
        const pkg = pickChargeablePackage(packages)
        if (pkg) {
          const updated = await tx.lessonPackage.incrementUsed(pkg.id)
          await tx.lesson.setPackage({
            lessonId: input.lessonId,
            studentId: e.studentId,
            packageId: pkg.id,
          })
          remainingByStudent[e.studentId] = Math.max(0, updated.total - updated.used)
        }
      } else if (e.status === 'COMPLETED' && ls.packageId) {
        const pkg = await tx.lessonPackage.findById(ls.packageId)
        remainingByStudent[e.studentId] = pkg ? Math.max(0, pkg.total - pkg.used) : 0
      } else {
        remainingByStudent[e.studentId] = await currentRemaining(tx, e.studentId)
      }
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
    await tx.lesson.update(input.lessonId, { status: statuses.every(status => status !== 'SCHEDULED') ? 'COMPLETED' : 'SCHEDULED' })
    const updated = await tx.lesson.findById(input.lessonId)
    return { lesson: updated!, remainingByStudent }
  }, { isolationLevel: 'Serializable' })

  return result
}

async function currentRemaining(
  tx: Repositories,
  studentId: string
): Promise<number> {
  const packages = await tx.lessonPackage.findActiveByStudent(studentId)
  const totalRemaining = packages.reduce((sum, p) => sum + Math.max(0, p.total - p.used), 0)
  return totalRemaining
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
  entries: { studentId: string; note: string }[]
}

export interface UpdateLessonNotesResult {
  lesson: LessonRecord
}

/** Ghi note riêng từng học viên cho buổi học — không điểm danh, không trừ gói, không đổi status buổi. */
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
    if (input.entries.some(e => !current!.students.some(s => s.studentId === e.studentId))) fail('LESSON_STUDENT_MISMATCH')

    for (const e of input.entries) {
      const note = e.note.trim()
      await tx.lesson.setStudentNote({
        lessonId: input.lessonId,
        studentId: e.studentId,
        note: note === '' ? null : note,
      })
    }

    await tx.audit.append({
      userId: input.staffId,
      action: 'LESSON_STUDENT_NOTE',
      entityType: 'Lesson',
      entityId: input.lessonId,
      details: { entries: input.entries.map((e) => ({ studentId: e.studentId })) },
    })

    const updated = await tx.lesson.findById(input.lessonId)
    return { lesson: updated! }
  }, { isolationLevel: 'Serializable' })

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
    default:
      return { code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 }
  }
}
