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
  packages: LessonPackage[]
}

export interface LessonPackage {
  id: string
  studentId: string
  name: string
  total: number
  used: number
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface LessonStudent {
  id: string
  lessonId: string
  studentId: string
  status: 'SCHEDULED' | 'COMPLETED' | 'ABSENT'
  note: string | null
  packageId: string | null
  student: { id: string; fullName: string }
  package: LessonPackage | null
}

export interface Lesson {
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
  connected: boolean
  email?: string
  calendarId?: string | null
  connectedAt?: string
  isConfigured?: boolean
}
