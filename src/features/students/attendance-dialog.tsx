'use client'
import { localTime } from './lesson-editor'
import { useEffect, useState } from 'react'
import { CheckCircle2, MessageSquareText, XCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
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
  onLessonChange,
  inline = false,
}: {
  lesson: Lesson
  onClose?: () => void
  onSaved: (lesson?: Lesson) => void
  onLessonChange?: (lesson: Lesson) => void
  inline?: boolean
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
  const [openNotes, setOpenNotes] = useState<Record<string, boolean>>({})
  const completedCount = lesson.students.filter(row => entries[row.studentId]?.status === 'COMPLETED').length
  const absentCount = lesson.students.filter(row => entries[row.studentId]?.status === 'ABSENT').length

  const handleSubmit = async () => {
    const notes = lesson.students.filter(row => entries[row.studentId]?.note !== (row.note ?? '')).map(row => ({ studentId: row.studentId, note: entries[row.studentId]?.note ?? '' }))
    if (!canAttend && !notes.length) return
    setSubmitting(true)
    try {
      const data = await apiJson<{ lesson: Lesson }>(`/api/lessons/${lesson.id}/${canAttend ? 'attendance' : 'notes'}`, {
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
      const updatedLesson = data.data?.lesson
      if (updatedLesson) {
        setLesson(updatedLesson)
        setEntries(Object.fromEntries(updatedLesson.students.map(row => [row.studentId, { status: row.status, note: row.note ?? '' }])))
        onLessonChange?.(updatedLesson)
      }
      onSaved(updatedLesson)
    } catch {
      notifyError('Lỗi kết nối máy chủ')
    } finally {
      setSubmitting(false)
    }
  }

  const saveButton = <Button variant="contrast" size="lg" fullWidth disabled={submitting || conflict || (!canAttend && !lesson.students.some(row => entries[row.studentId]?.note !== (row.note ?? '')))} onClick={handleSubmit}>
    {submitting ? 'Đang lưu...' : canAttend ? 'Lưu điểm danh' : 'Lưu ghi chú chuẩn bị'}
  </Button>
  const content = <>
    {conflict && <Button type="button" variant="white" disabled={submitting} onClick={async () => {
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
          onLessonChange?.(latest)
          setConflict(false)
          notifySuccess('Đã tải bản mới và giữ thay đổi đang soạn. Kiểm tra trước khi lưu lại')
        } catch { notifyError('Lỗi kết nối máy chủ') }
        finally { setSubmitting(false) }
      }}>Tải bản mới, giữ nội dung đang soạn</Button>}
      <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
        {lesson.students.map((ls) => {
          const entry = entries[ls.studentId]
          const previous = previousByStudent.get(ls.studentId)
          const noteOpen = openNotes[ls.studentId] ?? false
          const completed = entry?.status === 'COMPLETED'
          const absent = entry?.status === 'ABSENT'
          return (
            <li key={ls.studentId} className="py-4 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-zinc-900 dark:text-white">{ls.student.fullName}</p>
                  {entry?.note && !noteOpen && <p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">{entry.note}</p>}
                </div>
                <div role="group" aria-label={`Điểm danh ${ls.student.fullName}`} className="flex w-full gap-2 sm:w-auto">
                  <button
                    type="button"
                    disabled={submitting || !canAttend}
                    aria-pressed={completed}
                    onClick={() => setEntries((prev) => ({ ...prev, [ls.studentId]: { ...prev[ls.studentId], status: 'COMPLETED' } }))}
                    className={`min-h-11 flex-1 rounded-lg px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none sm:min-w-24 ${completed ? 'bg-success-bg text-success' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'}`}
                  >
                    <CheckCircle2 size={16} className="mr-1 inline" />Có mặt
                  </button>
                  <button
                    type="button"
                    disabled={submitting || !canAttend}
                    aria-pressed={absent}
                    onClick={() => setEntries((prev) => ({ ...prev, [ls.studentId]: { ...prev[ls.studentId], status: 'ABSENT' } }))}
                    className={`min-h-11 flex-1 rounded-lg px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none sm:min-w-24 ${absent ? 'bg-danger-bg text-danger bg-danger-bg text-danger' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'}`}
                  >
                    <XCircle size={16} className="mr-1 inline" />Vắng mặt
                  </button>
                </div>
              </div>
              <div className="mt-1 flex justify-end">
                <Button type="button" variant="ghost" size="sm" icon={MessageSquareText} aria-expanded={noteOpen} aria-controls={`lesson-note-${ls.studentId}`} onClick={() => setOpenNotes(prev => ({ ...prev, [ls.studentId]: !noteOpen }))}>
                  {noteOpen ? 'Ẩn ghi chú' : entry?.note ? 'Sửa ghi chú' : 'Thêm ghi chú'}
                </Button>
              </div>
              <div hidden={!noteOpen} className="mt-2 space-y-2">
                {previous && <p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400" title={`${previous.lessonTitle} · ${localTime(previous.startsAt).replace('T', ' ')}`}>
                  <span className="font-medium">Ghi chú buổi {dayLabel(previous.startsAt)}:</span> {previous.note}
                </p>}
                <Textarea
                  id={`lesson-note-${ls.studentId}`}
                  rows={2}
                  maxLength={2000}
                  disabled={submitting}
                  aria-label={`Ghi chú cho ${ls.student.fullName}`}
                  placeholder={canAttend ? 'Ghi chú sau buổi học...' : 'Ghi chú chuẩn bị cho học viên...'}
                  value={entry?.note ?? ''}
                  onChange={(e) => setEntries((prev) => ({ ...prev, [ls.studentId]: { ...prev[ls.studentId], note: e.target.value } }))}
                />
              </div>
            </li>
          )
        })}
      </ul>
      {inline && <div className="mt-4">{saveButton}</div>}
    </>

  if (inline) return (
    <section className="space-y-4 border-t border-zinc-200 pt-4 dark:border-zinc-800">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold text-zinc-950 dark:text-white">Điểm danh</h3>
          <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">{completedCount + absentCount}/{lesson.students.length} đã điểm danh · {completedCount} có mặt · {absentCount} vắng</p>
        </div>
        <Badge variant={canAttend ? 'blue' : 'warning'}>{canAttend ? 'Có thể điểm danh' : 'Chưa đến giờ'}</Badge>
      </div>
      {content}
    </section>
  )

  return <Modal
    open
    onClose={onClose ?? (() => {})}
    title={`Điểm danh — ${lesson.title}`}
    description={localTime(lesson.startsAt).replace('T', ' ')}
    size="md"
    footer={saveButton}
  >{content}</Modal>
}
