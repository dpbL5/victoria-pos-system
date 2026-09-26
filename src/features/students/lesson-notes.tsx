'use client'

import { useState } from 'react'
import { Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { apiJson } from '@/lib/api'
import type { Lesson } from './types'

export interface LessonNoteRow {
  studentId: string
  fullName: string
  note: string | null
}

// ── Ghi chú riêng từng học viên trong một buổi (LessonStudent.note) ──
async function saveNotes(lessonId: string, version: number, entries: { studentId: string; note: string }[]) {
  return apiJson<{ lesson: Lesson }>(`/api/lessons/${lessonId}/notes`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ version, entries }),
  })
}

const notePlaceholder = 'Ghi chú cho học viên này trong buổi…'

/** Note của tất cả học viên trong buổi — dùng ở Chi tiết buổi học. */
export function LessonStudentNotes({
  lessonId,
  version: currentVersion,
  students,
  onSaved,
}: {
  lessonId: string
  version: number
  students: LessonNoteRow[]
  onSaved?: (lesson: Lesson) => void
}) {
  const { success: notifySuccess, error: notifyError } = useToast()
  const [saving, setSaving] = useState(false)
  const [version, setVersion] = useState(currentVersion)
  const [conflict, setConflict] = useState(false)
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(students.map((row) => [row.studentId, row.note ?? '']))
  )

  const [baseline, setBaseline] = useState(students)
  const changed = baseline.some((row) => (draft[row.studentId] ?? '') !== (row.note ?? ''))

  const handleSave = async () => {
    setSaving(true)
    try {
      const result = await saveNotes(
        lessonId,
        version,
        baseline.filter(row => (draft[row.studentId] ?? '') !== (row.note ?? '')).map((row) => ({ studentId: row.studentId, note: draft[row.studentId] ?? '' }))
      )
      if (!result.success) {
        setConflict(result.code === 'LESSON_CONFLICT')
        notifyError(result.error || 'Không lưu được ghi chú')
        return
      }
      notifySuccess('Đã lưu ghi chú học viên')
      if (result.data) {
        const saved = result.data.lesson
        setVersion(saved.version)
        setBaseline(saved.students.map(row => ({ studentId: row.studentId, fullName: row.student.fullName, note: row.note })))
        setDraft(Object.fromEntries(saved.students.map(row => [row.studentId, row.note ?? ''])))
        onSaved?.(saved)
      }
    } catch {
      notifyError('Lỗi kết nối máy chủ')
    } finally {
      setSaving(false)
    }
  }

  const reload = async () => {
    setSaving(true)
    try {
      const result = await apiJson<Lesson>(`/api/lessons/${lessonId}`)
      if (!result.success || !result.data) { notifyError(result.error || 'Không tải được buổi học'); return }
      const latest = result.data
      if (latest.status === 'CANCELLED') { notifyError('Buổi học đã huỷ, hãy sao chép nội dung đang soạn trước khi đóng'); return }
      if (baseline.some(row => draft[row.studentId] !== (row.note ?? '') && !latest.students.some(s => s.studentId === row.studentId))) {
        notifyError('Có học viên đã rời buổi. Hãy sao chép ghi chú đang soạn trước khi đóng')
        return
      }
      setDraft(Object.fromEntries(latest.students.map(row => {
        const old = baseline.find(s => s.studentId === row.studentId)
        return [row.studentId, old && draft[row.studentId] !== (old.note ?? '') ? draft[row.studentId] : row.note ?? '']
      })))
      setBaseline(latest.students.map(row => ({ studentId: row.studentId, fullName: row.student.fullName, note: row.note })))
      setVersion(latest.version)
      setConflict(false)
      notifySuccess('Đã tải bản mới và giữ nội dung đang soạn. Kiểm tra trước khi lưu lại')
    } catch { notifyError('Lỗi kết nối máy chủ') }
    finally { setSaving(false) }
  }

  return (
    <section className="border-t border-zinc-200 pt-3 dark:border-zinc-800">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-zinc-950 dark:text-white">Ghi chú từng học viên</h4>
        <Button variant="secondary" size="sm" disabled={saving || conflict || !changed} onClick={handleSave}>
          {saving ? 'Đang lưu...' : 'Lưu ghi chú'}
        </Button>
      </div>
      {conflict && <Button type="button" variant="secondary" disabled={saving} onClick={reload}>Tải bản mới, giữ nội dung đang soạn</Button>}
      <ul className="mt-2 space-y-2">
        {baseline.map((row) => (
          <li key={row.studentId}>
            <label className="text-xs font-medium text-zinc-600 dark:text-zinc-300" htmlFor={`lesson-note-${row.studentId}`}>
              {row.fullName}
            </label>
            {row.note && row.note !== draft[row.studentId] && <p className="mt-1 text-xs text-zinc-500">Ghi chú đã lưu: {row.note}</p>}
            <Textarea
              className="mt-1"
              id={`lesson-note-${row.studentId}`}
              rows={2}
              disabled={saving}
              maxLength={2000}
              placeholder={notePlaceholder}
              value={draft[row.studentId] ?? ''}
              onChange={(event) => setDraft((prev) => ({ ...prev, [row.studentId]: event.target.value }))}
            />
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Note của một học viên cho một buổi, sửa inline — dùng ở Lịch học của học viên. */
export function StudentLessonNote({
  lessonId,
  version: currentVersion,
  studentId,
  studentName,
  note,
  onSaved,
}: {
  lessonId: string
  version: number
  studentId: string
  studentName?: string
  note: string | null
  onSaved?: (lesson: Lesson) => void
}) {
  const { success: notifySuccess, error: notifyError } = useToast()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [value, setValue] = useState(note ?? '')
  const [version, setVersion] = useState(currentVersion)
  const [savedNote, setSavedNote] = useState(note ?? '')
  const [conflict, setConflict] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      const result = await saveNotes(lessonId, version, [{ studentId, note: value }])
      if (!result.success) {
        setConflict(result.code === 'LESSON_CONFLICT')
        notifyError(result.error || 'Không lưu được ghi chú')
        return
      }
      notifySuccess('Đã lưu ghi chú học viên')
      if (result.data) {
        setVersion(result.data.lesson.version)
        setSavedNote(result.data.lesson.students.find(row => row.studentId === studentId)?.note ?? '')
        onSaved?.(result.data.lesson)
      }
      setOpen(false)
    } catch {
      notifyError('Lỗi kết nối máy chủ')
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <Button variant="ghost" size="sm" icon={Pencil} onClick={() => {
        const fresh = currentVersion > version
        setValue(fresh ? note ?? '' : savedNote)
        if (fresh) { setVersion(currentVersion); setSavedNote(note ?? '') }
        setConflict(false)
        setOpen(true)
      }}>
        Ghi chú
      </Button>
    )
  }

  return (
    <div className="mt-2 space-y-2">
      {savedNote && savedNote !== value && <p className="text-xs text-zinc-500">Ghi chú đã lưu: {savedNote}</p>}
      <Textarea
        autoFocus
        aria-label={studentName ? `Ghi chú buổi học của ${studentName}` : 'Ghi chú buổi học'}
        rows={2}
        disabled={saving}
        maxLength={2000}
        placeholder={notePlaceholder}
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      {conflict && <Button type="button" variant="secondary" disabled={saving} onClick={async () => {
        setSaving(true)
        try {
          const result = await apiJson<Lesson>(`/api/lessons/${lessonId}`)
          if (!result.success || !result.data) { notifyError(result.error || 'Không tải được buổi học'); return }
          const row = result.data.students.find(item => item.studentId === studentId)
          if (!row || result.data.status === 'CANCELLED') { notifyError('Buổi học đã huỷ hoặc học viên đã rời buổi. Hãy sao chép ghi chú trước khi đóng'); return }
          setVersion(result.data.version)
          setSavedNote(row.note ?? '')
          setConflict(false)
          notifySuccess('Đã tải bản mới và giữ nội dung đang soạn. Kiểm tra trước khi lưu lại')
        } catch { notifyError('Lỗi kết nối máy chủ') }
        finally { setSaving(false) }
      }}>Tải bản mới, giữ nội dung đang soạn</Button>}
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" disabled={saving || conflict || value === savedNote} onClick={handleSave}>
          {saving ? 'Đang lưu...' : 'Lưu ghi chú'}
        </Button>
        <Button variant="ghost" size="sm" disabled={saving} onClick={() => setOpen(false)}>Huỷ</Button>
      </div>
    </div>
  )
}
