// ── Helper cho domain Lớp học ─────
import { parseLocalDate, parseLocalDateEnd } from '@/lib/shared/utils'
import type { LessonClassRecord, StudentRecord } from '../ports'

/** Lớp hiện tại của học viên (ràng buộc: mỗi học viên chỉ thuộc một lớp). */
export function studentClass(student: Pick<StudentRecord, 'classMemberships'>): { id: string; name: string } | null {
  const membership = student.classMemberships.find(row => row.lessonClass.isActive)
  return membership ? { id: membership.lessonClass.id, name: membership.lessonClass.name } : null
}

export interface ClassSlotInput {
  daysOfWeek: number[]
  startTime: string
  durationMin: number
  startsOn: Date
  endsOn?: Date | null
  intervalWeeks?: number
  occurrenceCount?: number | null
}

/** Đổi ngày dạng chuỗi của payload sang Date; trả null khi khoảng ngày không hợp lệ (>10 năm hoặc kết thúc trước bắt đầu). */
export function parseSlotDates(input: { startsOn: string; endsOn?: string | null }): { startsOn: Date; endsOn: Date | null } | null {
  const startsOn = parseLocalDate(input.startsOn)
  const endsOn = input.endsOn ? parseLocalDateEnd(input.endsOn) : null
  if (endsOn && (endsOn < startsOn || endsOn.getTime() - startsOn.getTime() > 10 * 366 * 86400000)) return null
  return { startsOn, endsOn }
}

/** Sổ học viên chính thức của lớp, độc lập với khung giờ. */
export function classRosterIds(lessonClass: Pick<LessonClassRecord, 'students'>): string[] {
  return lessonClass.students.map(member => member.studentId)
}

/** Sổ học viên kèm tên — để hiển thị ở màn hình lớp. */
export function classRoster(lessonClass: Pick<LessonClassRecord, 'students'>) {
  return lessonClass.students.map(member => ({ id: member.studentId, fullName: member.student.fullName, phone: member.student.phone }))
}
