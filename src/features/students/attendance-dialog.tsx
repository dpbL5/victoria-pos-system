'use client'
import { localTime } from './lesson-editor'
import { useEffect, useState } from 'react'
import { CheckCircle2, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { useToast } from '@/components/ui/toast'
import { useApi } from '@/hooks/use-api'
import { apiJson } from '@/lib/api'
import type { Lesson } from './types'

interface PreviousNote {
  studentId: string
  note: string
  startsAt: string
  lessonTitle: string
}

const dayLabel = (iso: string) => {
  const day = localTime(iso).slice(0, 10)
  return `${day.slice(8, 10)}/${day.slice(5, 7)}`
}

// ── Dialog điểm danh + note từng học viên ──
export function AttendanceDialog({
  lesson: initialLesson,
  onClose,
  onSaved,
}: {
  lesson: Lesson
  onClose: () => void
  onSaved: () => void
}) {
  const { success: notifySuccess, error: notifyError } = useToast()
  const [lesson, setLesson] = useState(initialLesson)
  const [submitting, setSubmitting] = useState(false)
  const [conflict, setConflict] = useState(false)
  const [now, setNow] = useState(Date.now)
  const endsAt = Date.parse(lesson.startsAt) + lesson.durationMin * 60_000
  const canAttend = endsAt <= now
  useEffect(() => {
    if (endsAt <= now) return
    const timer = setTimeout(() => setNow(Date.now()), Math.max(0, Math.min(endsAt - Date.now(), 2_147_483_647)))
    return () => clearTimeout(timer)
  }, [endsAt, now])
  const { data: history } = useApi<{ notes: PreviousNote[] }>(`/api/lessons/${lesson.id}/previous-notes`)
  const previousByStudent = new Map((history?.data?.notes ?? []).map(note => [note.studentId, note]))
  const [entries, setEntries] = useState<Record<string, { status: 'COMPLETED' | 'ABSENT' | 'SCHEDULED'; note: string }>>(() => {
    const init: Record<string, { status: 'COMPLETED' | 'ABSENT' | 'SCHEDULED'; note: string }> = {}
    for (const ls of lesson.students) {
      init[ls.studentId] = { status: ls.status, note: ls.note ?? '' }
    }
    return init
  })

  const handleSubmit = async () => {
    const notes = lesson.students.filter(row => entries[row.studentId]?.note !== (row.note ?? '')).map(row => ({ studentId: row.studentId, note: entries[row.studentId]?.note ?? '' }))
    if (!canAttend && !notes.length) return
    setSubmitting(true)
    try {
      const data = await apiJson<{ lesson: Lesson; remainingByStudent: Record<string, number> }>(`/api/lessons/${lesson.id}/${canAttend ? 'attendance' : 'notes'}`, {
        method: canAttend ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version: lesson.version,
          entries: canAttend ? lesson.students.map((ls) => ({
            studentId: ls.studentId,
            status: entries[ls.studentId]?.status ?? 'SCHEDULED',
            ...(entries[ls.studentId]?.note !== (ls.note ?? '') ? { note: entries[ls.studentId]?.note ?? '' } : {}),
          })) : notes,
        }),
      })
      if (!data.success) {
        setConflict(data.code === 'LESSON_CONFLICT')
        notifyError(data.error || 'Không lưu được buổi học')
        return
      }
      notifySuccess(canAttend ? 'Đã lưu điểm danh' : 'Đã lưu ghi chú chuẩn bị')
      onSaved()
    } catch {
      notifyError('Lỗi kết nối máy chủ')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Điểm danh — ${lesson.title}`}
      description={localTime(lesson.startsAt).replace('T', ' ')}
      size="md"
      footer={
        <Button variant="inverse" size="lg" fullWidth disabled={submitting || conflict || (!canAttend && !lesson.students.some(row => entries[row.studentId]?.note !== (row.note ?? '')))} onClick={handleSubmit}>
          {submitting ? 'Đang lưu...' : canAttend ? 'Lưu điểm danh' : 'Lưu ghi chú chuẩn bị'}
        </Button>
      }
    >
      {!canAttend && <p className="mb-3 text-sm text-amber-700 dark:text-amber-300">Có thể ghi chú chuẩn bị trước buổi; điểm danh mở sau giờ kết thúc dự kiến.</p>}
      {conflict && <Button type="button" variant="secondary" disabled={submitting} onClick={async () => {
        setSubmitting(true)
        try {
          const result = await apiJson<Lesson>(`/api/lessons/${lesson.id}`)
          if (!result.success || !result.data) { notifyError(result.error || 'Không tải được buổi học'); return }
          if (result.data.status === 'CANCELLED') { notifyError('Buổi học đã huỷ. Hãy sao chép ghi chú trước khi đóng'); return }
          const latest = result.data
          if (lesson.students.some(row => entries[row.studentId]?.note !== (row.note ?? '') && !latest.students.some(s => s.studentId === row.studentId))) {
            notifyError('Có học viên đã rời buổi. Hãy sao chép ghi chú trước khi đóng')
            return
          }
          setEntries(Object.fromEntries(latest.students.map(row => {
            const old = lesson.students.find(s => s.studentId === row.studentId)
            const draft = entries[row.studentId]
            return [row.studentId, {
              status: old && draft.status !== old.status ? draft.status : row.status,
              note: old && draft.note !== (old.note ?? '') ? draft.note : row.note ?? '',
            }]
          })))
          setLesson(latest)
          setConflict(false)
          notifySuccess('Đã tải bản mới và giữ thay đổi đang soạn. Kiểm tra trước khi lưu lại')
        } catch { notifyError('Lỗi kết nối máy chủ') }
        finally { setSubmitting(false) }
      }}>Tải bản mới, giữ nội dung đang soạn</Button>}
      <ul className="space-y-3">
        {lesson.students.map((ls) => {
          const entry = entries[ls.studentId]
          const previous = previousByStudent.get(ls.studentId)
          return (
            <li key={ls.studentId} className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-zinc-900 dark:text-white">{ls.student.fullName}</p>
                <div className="flex gap-1">
                  <button
                    type="button"
                    disabled={submitting || !canAttend}
                    aria-pressed={entry?.status === 'COMPLETED'}
                    onClick={() => setEntries((prev) => ({ ...prev, [ls.studentId]: { ...prev[ls.studentId], status: 'COMPLETED' } }))}
                    className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${entry?.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400' : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800'}`}
                  >
                    <CheckCircle2 size={12} className="inline mr-0.5" /> Hoàn thành
                  </button>
                  <button
                    type="button"
                    disabled={submitting || !canAttend}
                    aria-pressed={entry?.status === 'ABSENT'}
                    onClick={() => setEntries((prev) => ({ ...prev, [ls.studentId]: { ...prev[ls.studentId], status: 'ABSENT' } }))}
                    className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${entry?.status === 'ABSENT' ? 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400' : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800'}`}
                  >
                    <XCircle size={12} className="inline mr-0.5" /> Vắng
                  </button>
                </div>
              </div>
              {previous && (
                <p className="mt-1.5 rounded-md bg-zinc-50 px-2 py-1 text-xs leading-relaxed text-zinc-600 dark:bg-zinc-800/60 dark:text-zinc-300" title={`${previous.lessonTitle} · ${localTime(previous.startsAt).replace('T', ' ')}`}>
                  <span className="font-medium">Buổi trước {dayLabel(previous.startsAt)}:</span> {previous.note}
                </p>
              )}
              <Textarea
                className="mt-2"
                rows={1}
                maxLength={2000}
                disabled={submitting}
                placeholder={canAttend ? 'Ghi chú sau buổi học...' : 'Ghi chú chuẩn bị cho học viên...'}
                value={entry?.note ?? ''}
                onChange={(e) => setEntries((prev) => ({ ...prev, [ls.studentId]: { ...prev[ls.studentId], note: e.target.value } }))}
              />
            </li>
          )
        })}
      </ul>
    </Modal>
  )
}
