// ── Use-case: điểm danh buổi học + trừ gói buổi ─────
import { err } from '@/lib/shared/result'
import type { DomainError, Result } from '@/lib/shared/result'
import { runInTransaction } from '@/lib/infrastructure/db-helpers'
import type { HttpErrorInfo } from '@/lib/infrastructure/api-helpers'
import type { Repositories } from '@/lib/infrastructure/repositories'
import { repositories } from '@/lib/infrastructure/repositories'
import { pickChargeablePackage } from '../helpers/package-math'
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
    const remainingByStudent: Record<string, number> = {}

    for (const e of input.entries) {
      const ls = lesson.students.find((s) => s.studentId === e.studentId)
      if (!ls) continue

      // Cập nhật status + note cho LessonStudent này
      await tx.lesson.upsertAttendance({
        lessonId: input.lessonId,
        studentId: e.studentId,
        status: e.status,
        note: e.note?.trim() || undefined,
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

    const updated = await tx.lesson.findById(input.lessonId)
    return { lesson: updated!, remainingByStudent }
  })

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

export function mapMarkAttendanceError(error: DomainError): HttpErrorInfo {
  switch (error.code) {
    case 'LESSON_NOT_FOUND':
      return { code: 'LESSON_NOT_FOUND', message: 'Không tìm thấy buổi học', status: 404 }
    case 'LESSON_STUDENT_MISMATCH':
      return { code: 'LESSON_STUDENT_MISMATCH', message: 'Có học viên không thuộc buổi học này', status: 400 }
    default:
      return { code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 }
  }
}
