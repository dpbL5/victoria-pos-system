// ── Helper: note buổi học trước của từng học viên ─────

/** Dòng note thô — đã sắp theo buổi mới nhất trước. */
export interface AttendanceNoteRow {
  studentId: string
  note: string | null
  lesson: { startsAt: Date; title: string }
}

export interface PreviousAttendanceNote {
  studentId: string
  note: string
  startsAt: Date
  lessonTitle: string
}

/** Giữ note khác rỗng đầu tiên (buổi gần nhất) của mỗi học viên. */
export function latestNotesPerStudent(rows: AttendanceNoteRow[]): PreviousAttendanceNote[] {
  const seen = new Set<string>()
  const notes: PreviousAttendanceNote[] = []
  for (const row of rows) {
    const note = row.note?.trim()
    if (!note || seen.has(row.studentId)) continue
    seen.add(row.studentId)
    notes.push({ studentId: row.studentId, note, startsAt: row.lesson.startsAt, lessonTitle: row.lesson.title })
  }
  return notes
}
