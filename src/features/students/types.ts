// ── Types cho UI domain Học viên ─────

export interface Student {
  id: string
  fullName: string
  phone: string | null
  birthYear: number | null
  notes: string | null
  status: 'ACTIVE' | 'INACTIVE'
  deletedAt: string | null
  createdAt: string
  updatedAt: string
  classMemberships?: { lessonClass: { id: string; name: string; isActive: boolean } }[]
}

/** Lớp hiện tại của học viên — ràng buộc: mỗi học viên chỉ thuộc một lớp. */
export const studentClassOf = (student: Pick<Student, 'classMemberships'>): { id: string; name: string } | null =>
  student.classMemberships?.find(row => row.lessonClass.isActive)?.lessonClass ?? null

export interface LessonStudent {
  id: string
  lessonId: string
  studentId: string
  status: 'SCHEDULED' | 'COMPLETED' | 'ABSENT'
  note: string | null
  student: { id: string; fullName: string }
}

export interface LessonSeries {
  id: string
  version: number
  title: string
  daysOfWeek: number[]
  startTime: string
  durationMin: number
  intervalWeeks: number
  occurrenceCount: number | null
  startsOn: string
  endsOn: string | null
  class?: { id: string; name: string } | null
}
export interface Lesson {
  version: number
  originalStartAt: string | null
  shareNote: boolean
  isException: boolean
  series: LessonSeries | null
  class?: { id: string; name: string } | null
  id: string
  seriesId: string | null
  title: string
  coachName: string | null
  startsAt: string
  durationMin: number
  status: 'SCHEDULED' | 'COMPLETED' | 'CANCELLED'
  note: string | null
  googleEventId: string | null
  students: LessonStudent[]
}

export interface CalendarStatus {
  lastSyncedAt?: string | null
  connected: boolean
  needsReconnect?: boolean
  pending?: number
  failed?: number
  email?: string
  calendarId?: string | null
  connectedAt?: string
  isConfigured?: boolean
}
