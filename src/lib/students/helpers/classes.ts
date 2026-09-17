// ── Helper cho domain Lớp học ─────
import { parseLocalDate, parseLocalDateEnd } from '@/lib/shared/utils'
import type { LessonClassRecord, StudentRecord } from '../ports'

/** Lớp hiện tại của học viên (ràng buộc: mỗi học viên chỉ thuộc một lớp). */
export function studentClass(student: Pick<StudentRecord, 'series'>): { id: string; name: string } | null {
  for (const row of student.series) {
    if (row.series.class) return { id: row.series.class.id, name: row.series.class.name }
  }
  return null
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

/** Sổ học viên của lớp = hợp nhất học viên của mọi khung giờ (không trùng). */
export function classRosterIds(lessonClass: Pick<LessonClassRecord, 'slots'>): string[] {
  const ids = new Set<string>()
  for (const slot of lessonClass.slots) for (const member of slot.students) ids.add(member.studentId)
  return [...ids]
}

/** Sổ học viên kèm tên — để hiển thị ở màn hình lớp. */
export function classRoster(lessonClass: Pick<LessonClassRecord, 'slots'>) {
  const map = new Map<string, { id: string; fullName: string; phone: string | null }>()
  for (const slot of lessonClass.slots) {
    for (const member of slot.students) {
      if (!map.has(member.studentId)) {
        map.set(member.studentId, { id: member.studentId, fullName: member.student.fullName, phone: member.student.phone })
      }
    }
  }
  return [...map.values()].sort((a, b) => a.fullName.localeCompare(b.fullName, 'vi'))
}
