// ── Guard dùng chung cho lớp học (gọi trong transaction) ─────
import { fail } from '@/lib/infrastructure/db-helpers'
import type { Repositories } from '@/lib/infrastructure/repositories'

/**
 * Ràng buộc: một học viên chỉ thuộc một lớp.
 * Chặn khi học viên đã ở lớp khác `excludeClassId` (lớp đang sửa) → rollback transaction.
 */
export async function assertStudentsInSingleClass(
  deps: Pick<Repositories, 'lessonClass'>,
  studentIds: string[],
  options: { excludeClassId?: string } = {}
) {
  if (!studentIds.length) return
  const rows = (await deps.lessonClass.classesOfStudents(studentIds)).filter(row => row.classId !== options.excludeClassId)
  if (!rows.length) return
  const detail = [...new Map(rows.map(row => [row.studentId, `${row.studentName} (${row.className})`])).values()].join(', ')
  fail('CLASS_STUDENT_TAKEN', detail)
}
