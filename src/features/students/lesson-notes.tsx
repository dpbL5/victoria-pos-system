'use client'

import { useState } from 'react'
import { Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { apiJson } from '@/lib/api'
import type { Lesson } from './types'

// ── Ghi chú riêng từng học viên trong một buổi (LessonStudent.note) ──
async function saveNotes(lessonId: string, version: number, entries: { studentId: string; note: string }[]) {
  return apiJson<{ lesson: Lesson }>(`/api/lessons/${lessonId}/notes`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ version, entries }),
  })
}

const notePlaceholder = 'Ghi chú cho học viên này trong buổi…'

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
        {conflict && <Button type="button" variant="white" disabled={saving} onClick={async () => {
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
      <Button variant="contrast" size="sm" disabled={saving || conflict || value === savedNote} onClick={handleSave}>
          {saving ? 'Đang lưu...' : 'Lưu ghi chú'}
        </Button>
        <Button variant="ghost" size="sm" disabled={saving} onClick={() => setOpen(false)}>Huỷ</Button>
      </div>
    </div>
  )
}
