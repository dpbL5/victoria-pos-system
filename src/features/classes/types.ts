// ── Kiểu dữ liệu màn hình Lớp học ─────
export interface ClassSlot {
  id: string
  version: number
  daysOfWeek: number[]
  startTime: string
  durationMin: number
  startsOn: string
  endsOn: string | null
  isActive: boolean
  materializedUntil: string | null
  students: { studentId: string }[]
}

export interface LessonClass {
  id: string
  name: string
  coachName: string | null
  note: string | null
  isActive: boolean
  slots: ClassSlot[]
  studentCount: number
  nextLessonAt: string | null
}

export interface ClassDetail {
  id: string
  name: string
  coachName: string | null
  note: string | null
  isActive: boolean
  slots: ClassSlot[]
  roster: { id: string; fullName: string; phone: string | null }[]
  studentCount: number
  lessonCount: number
}
