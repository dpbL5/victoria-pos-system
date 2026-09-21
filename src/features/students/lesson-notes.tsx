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
async function saveNotes(lessonId: string, entries: { studentId: string; note: string }[]) {
  return apiJson<{ lesson: Lesson }>(`/api/lessons/${lessonId}/notes`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entries }),
  })
}

const notePlaceholder = 'Ghi chú cho học viên này trong buổi…'

/** Note của tất cả học viên trong buổi — dùng ở Chi tiết buổi học. */
export function LessonStudentNotes({
  lessonId,
  students,
  onSaved,
}: {
  lessonId: string
  students: LessonNoteRow[]
  onSaved?: () => void
}) {
  const { success: notifySuccess, error: notifyError } = useToast()
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(students.map((row) => [row.studentId, row.note ?? '']))
  )

  const changed = students.some((row) => (draft[row.studentId] ?? '') !== (row.note ?? ''))

  const handleSave = async () => {
    setSaving(true)
    try {
      const result = await saveNotes(
        lessonId,
        students.map((row) => ({ studentId: row.studentId, note: draft[row.studentId] ?? '' }))
      )
      if (!result.success) {
        notifyError(result.error || 'Không lưu được ghi chú')
        return
      }
      notifySuccess('Đã lưu ghi chú học viên')
      onSaved?.()
    } catch {
      notifyError('Lỗi kết nối máy chủ')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="border-t border-zinc-200 pt-3 dark:border-zinc-800">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-zinc-950 dark:text-white">Ghi chú từng học viên</h4>
        <Button variant="secondary" size="sm" disabled={saving || !changed} onClick={() => void handleSave()}>
          {saving ? 'Đang lưu...' : 'Lưu ghi chú'}
        </Button>
      </div>
      <ul className="mt-2 space-y-2">
        {students.map((row) => (
          <li key={row.studentId}>
            <label className="text-xs font-medium text-zinc-600 dark:text-zinc-300" htmlFor={`lesson-note-${row.studentId}`}>
              {row.fullName}
            </label>
            <Textarea
              className="mt-1"
              id={`lesson-note-${row.studentId}`}
              rows={2}
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
  studentId,
  studentName,
  note,
  onSaved,
}: {
  lessonId: string
  studentId: string
  studentName?: string
  note: string | null
  onSaved?: () => void
}) {
  const { success: notifySuccess, error: notifyError } = useToast()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [value, setValue] = useState(note ?? '')

  const handleSave = async () => {
    setSaving(true)
    try {
      const result = await saveNotes(lessonId, [{ studentId, note: value }])
      if (!result.success) {
        notifyError(result.error || 'Không lưu được ghi chú')
        return
      }
      notifySuccess('Đã lưu ghi chú học viên')
      setOpen(false)
      onSaved?.()
    } catch {
      notifyError('Lỗi kết nối máy chủ')
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <Button variant="ghost" size="sm" icon={Pencil} onClick={() => { setValue(note ?? ''); setOpen(true) }}>
        Ghi chú
      </Button>
    )
  }

  return (
    <div className="mt-2 space-y-2">
      <Textarea
        autoFocus
        aria-label={studentName ? `Ghi chú buổi học của ${studentName}` : 'Ghi chú buổi học'}
        rows={2}
        maxLength={2000}
        placeholder={notePlaceholder}
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" disabled={saving} onClick={() => void handleSave()}>
          {saving ? 'Đang lưu...' : 'Lưu ghi chú'}
        </Button>
        <Button variant="ghost" size="sm" disabled={saving} onClick={() => setOpen(false)}>Huỷ</Button>
      </div>
    </div>
  )
}
