'use client'
import { localTime } from './lesson-editor'
import { useState } from 'react'
import { CheckCircle2, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { useToast } from '@/components/ui/toast'
import { apiJson } from '@/lib/api'
import type { Lesson } from './types'
// ── Dialog điểm danh + note từng học viên ──
export function AttendanceDialog({
  lesson,
  onClose,
  onSaved,
}: {
  lesson: Lesson
  onClose: () => void
  onSaved: () => void
}) {
  const { success: notifySuccess, error: notifyError } = useToast()
  const [submitting, setSubmitting] = useState(false)
  const [entries, setEntries] = useState<Record<string, { status: 'COMPLETED' | 'ABSENT' | 'SCHEDULED'; note: string }>>(() => {
    const init: Record<string, { status: 'COMPLETED' | 'ABSENT' | 'SCHEDULED'; note: string }> = {}
    for (const ls of lesson.students) {
      init[ls.studentId] = { status: ls.status, note: ls.note ?? '' }
    }
    return init
  })

  const handleSubmit = async () => {
    setSubmitting(true)
    try {
      const data = await apiJson<{ lesson: Lesson; remainingByStudent: Record<string, number> }>(`/api/lessons/${lesson.id}/attendance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entries: lesson.students.map((ls) => ({
            studentId: ls.studentId,
            status: entries[ls.studentId]?.status ?? 'SCHEDULED',
            note: entries[ls.studentId]?.note ?? '',
          })),
        }),
      })
      if (!data.success) {
        notifyError(data.error || 'Không lưu được điểm danh')
        return
      }
      notifySuccess('Đã lưu điểm danh')
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
        <Button variant="inverse" size="lg" fullWidth disabled={submitting} onClick={handleSubmit}>
          {submitting ? 'Đang lưu...' : 'Lưu điểm danh'}
        </Button>
      }
    >
      <ul className="space-y-3">
        {lesson.students.map((ls) => {
          const entry = entries[ls.studentId]
          return (
            <li key={ls.studentId} className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-zinc-900 dark:text-white">{ls.student.fullName}</p>
                <div className="flex gap-1">
                  <button
                    type="button"
                    aria-pressed={entry?.status === 'COMPLETED'}
                    onClick={() => setEntries((prev) => ({ ...prev, [ls.studentId]: { ...prev[ls.studentId], status: 'COMPLETED' } }))}
                    className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${entry?.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400' : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800'}`}
                  >
                    <CheckCircle2 size={12} className="inline mr-0.5" /> Hoàn thành
                  </button>
                  <button
                    type="button"
                    aria-pressed={entry?.status === 'ABSENT'}
                    onClick={() => setEntries((prev) => ({ ...prev, [ls.studentId]: { ...prev[ls.studentId], status: 'ABSENT' } }))}
                    className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${entry?.status === 'ABSENT' ? 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400' : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800'}`}
                  >
                    <XCircle size={12} className="inline mr-0.5" /> Vắng
                  </button>
                </div>
              </div>
              <Textarea
                className="mt-2"
                rows={1}
                placeholder="Note sau buổi học..."
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
