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
  series?: { series: { class: { id: string; name: string } | null } }[]
}

/** Lớp hiện tại của học viên — ràng buộc: mỗi học viên chỉ thuộc một lớp. */
export const studentClassOf = (student: Pick<Student, 'series'>): { id: string; name: string } | null =>
  student.series?.find(row => row.series.class)?.series.class ?? null

/** Số buổi còn lại của học viên — tổng các gói đang hoạt động, kẹp ở 0 (gói bị hạ `total` dưới `used` không ra số âm). */
export const studentRemaining = (student: Pick<Student, 'packages'>): number =>
  student.packages.filter((p) => p.isActive).reduce((sum, p) => sum + Math.max(0, p.total - p.used), 0)

/** Dòng danh sách học viên — kèm số buổi còn lại đã tính sẵn để sort được theo cột "Còn lại". */
export interface StudentRow extends Student {
  remainingSessions: number
}

export const studentRowOf = (student: Student): StudentRow => ({ ...student, remainingSessions: studentRemaining(student) })

/** Nhãn cột "Còn lại": phân biệt chưa mua gói với gói đã hết buổi. */
export const remainingLabel = (row: Pick<StudentRow, 'remainingSessions' | 'packages'>): string =>
  row.remainingSessions > 0 ? `${row.remainingSessions} buổi` : row.packages.length ? 'Hết buổi' : 'Chưa có gói'

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
  syncStatus?: string
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
