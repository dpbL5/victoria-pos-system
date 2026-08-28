'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarClock, CheckCircle2, ChevronLeft, ChevronRight, GraduationCap, Plus, Repeat, Trash2, Users, XCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input, Label, Select, Textarea } from '@/components/ui/input'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Modal } from '@/components/ui/modal'
import { NoticeCard } from '@/components/ui/notice-card'
import { Skeleton, SkeletonPage, SkeletonRows } from '@/components/ui/skeleton'
import { useToast } from '@/components/ui/toast'
import { useApi } from '@/hooks/use-api'
import { apiJson } from '@/lib/api'
import { usePageRefresh } from '@/components/layout/page-refresh-context'
import type { Lesson, Student } from './types'

const DAY_NAMES = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']

function fmtDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

/** Ngày hiện tại dạng "YYYY-MM-DD" giờ VN. */
function todayInput(): string {
  const d = new Date(Date.now() + 7 * 60 * 60 * 1000)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

function shiftDays(dateStr: string, delta: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d) + delta * 24 * 60 * 60 * 1000)
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
}

export function LessonsScreen() {
  const { success: notifySuccess, error: notifyError } = useToast()
  const router = useRouter()
  const [weekStart, setWeekStart] = useState(() => shiftDays(todayInput(), -(new Date(Date.now() + 7 * 60 * 60 * 1000).getUTCDay())))
  const weekEnd = shiftDays(weekStart, 6)

  const { data: lessonsData, isLoading, mutate } = useApi<Lesson[]>(`/api/lessons?from=${weekStart}&to=${weekEnd}`)
  const { data: studentsData } = useApi<Student[]>('/api/students', { dedupingInterval: 60_000 })

  const { registerRefresh } = usePageRefresh()
  useEffect(() => {
    return registerRefresh(() => void mutate())
  }, [registerRefresh, mutate])

  const lessons = lessonsData?.data ?? []
  const error = !lessonsData?.success ? (lessonsData?.error ?? '') : ''
  const loading = isLoading
  const students = studentsData?.data ?? []

  const [submitting, setSubmitting] = useState(false)
  const [lessonOpen, setLessonOpen] = useState(false)
  const [seriesOpen, setSeriesOpen] = useState(false)
  const [attendanceLesson, setAttendanceLesson] = useState<Lesson | null>(null)
  const [deleteLesson, setDeleteLesson] = useState<Lesson | null>(null)

  const upcoming = lessons.filter((l) => new Date(l.startsAt).getTime() >= Date.now())
  const past = lessons.filter((l) => new Date(l.startsAt).getTime() < Date.now())

  const handleDelete = async () => {
    if (!deleteLesson) return
    setSubmitting(true)
    try {
      const data = await apiJson(`/api/lessons/${deleteLesson.id}`, { method: 'DELETE' })
      if (!data.success) {
        notifyError(data.error || 'Không xoá được buổi học')
        return
      }
      notifySuccess('Đã xoá buổi học')
      setDeleteLesson(null)
      await mutate()
    } catch {
      notifyError('Lỗi kết nối máy chủ')
    } finally {
      setSubmitting(false)
    }
  }

  const statusBadge = (l: Lesson) => {
    const completed = l.students.filter((s) => s.status === 'COMPLETED').length
    const absent = l.students.filter((s) => s.status === 'ABSENT').length
    if (l.status === 'CANCELLED') return <Badge variant="default">Đã huỷ</Badge>
    if (new Date(l.startsAt).getTime() < Date.now()) {
      return <Badge variant="blue">Đã điểm danh {completed}/{l.students.length}{absent > 0 ? ` · ${absent} vắng` : ''}</Badge>
    }
    return <Badge variant="success">Sắp tới</Badge>
  }

  if (loading && lessons.length === 0) {
    return (
      <SkeletonPage maxWidth="max-w-3xl">
          <Skeleton className="h-10 w-48" />
          <SkeletonRows count={2} />
      </SkeletonPage>
    )
  }

  return (
    <div className="min-h-full bg-zinc-50 px-4 py-4 dark:bg-zinc-950 md:px-6 md:py-6">
      <div className="mx-auto max-w-3xl space-y-4">
        <header className="hidden items-center justify-between gap-3 md:flex">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-2xl font-bold text-zinc-950 dark:text-white">
              <GraduationCap size={24} className="text-amber-500" />
              Lịch học
            </h1>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" icon={Users} onClick={() => router.push('/students')}>Học viên</Button>
            <Button variant="secondary" size="sm" icon={Repeat} onClick={() => setSeriesOpen(true)}>Lịch lặp</Button>
            <Button variant="primary" size="sm" icon={Plus} onClick={() => setLessonOpen(true)}>Thêm buổi</Button>
          </div>
        </header>

        {/* Week picker */}
        <Card padding="sm" className="flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" icon={ChevronLeft} onClick={() => setWeekStart((w) => shiftDays(w, -7))} />
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-zinc-900 dark:text-white">
              Tuần {weekStart} → {weekEnd}
            </span>
            <Button variant="secondary" size="xs" onClick={() => setWeekStart(() => shiftDays(todayInput(), -(new Date(Date.now() + 7 * 60 * 60 * 1000).getUTCDay())))}>Hôm nay</Button>
          </div>
          <Button variant="ghost" size="sm" icon={ChevronRight} onClick={() => setWeekStart((w) => shiftDays(w, 7))} />
        </Card>

        {/* Mobile action buttons */}
        <div className="grid grid-cols-2 gap-2 md:hidden">
          <Button variant="primary" size="md" icon={Plus} fullWidth onClick={() => setLessonOpen(true)}>Thêm buổi</Button>
          <Button variant="secondary" size="md" icon={Repeat} fullWidth onClick={() => setSeriesOpen(true)}>Lịch lặp</Button>
        </div>

        {error && <NoticeCard tone="danger" title="Không tải được dữ liệu" description={error} />}

        {/* Lessons grouped by day */}
        {lessons.length === 0 && (
          <Card padding="lg">
            <p className="text-center text-sm text-zinc-500 dark:text-zinc-400">Không có buổi học nào trong tuần này.</p>
          </Card>
        )}

        {[0, 1, 2, 3, 4, 5, 6].map((dayOffset) => {
          const day = shiftDays(weekStart, dayOffset)
          const dayLessons = lessons.filter((l) => {
            const d = new Date(Date.parse(l.startsAt) + 7 * 60 * 60 * 1000)
            const iso = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
            return iso === day
          })
          if (dayLessons.length === 0) return null
          const isToday = day === todayInput()
          return (
            <Card key={day} padding="none" className={isToday ? 'ring-1 ring-blue-300 dark:ring-blue-500/40' : ''}>
              <div className={`px-4 py-2 text-xs font-semibold uppercase tracking-wide ${isToday ? 'text-blue-600 dark:text-blue-400' : 'text-zinc-500 dark:text-zinc-400'}`}>
                {DAY_NAMES[new Date(Date.parse(day) + 7 * 60 * 60 * 1000).getUTCDay()]} · {day}
              </div>
              <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
                {dayLessons.map((l) => {
                  const myStudents = l.students.map((s) => s.student.fullName).join(', ')
                  return (
                    <li key={l.id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-zinc-900 dark:text-white">
                          {fmtDate(l.startsAt)} — {l.title}
                        </p>
                        <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                          {myStudents || '—'}{l.coachName ? ` · HLV ${l.coachName}` : ''}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {statusBadge(l)}
                        <Button variant="secondary" size="sm" icon={CheckCircle2} disabled={submitting || l.status === 'CANCELLED'} onClick={() => setAttendanceLesson(l)} title="Điểm danh / note" />
                        <Button variant="outline-danger" size="sm" icon={Trash2} disabled={submitting} onClick={() => setDeleteLesson(l)} title="Xoá" />
                      </div>
                    </li>
                  )
                })}
              </ul>
            </Card>
          )
        })}

        <LessonDialog
          open={lessonOpen}
          students={students}
          submitting={submitting}
          onClose={() => setLessonOpen(false)}
          onSaved={() => { setLessonOpen(false); void mutate() }}
        />

        <SeriesDialog
          open={seriesOpen}
          students={students}
          submitting={submitting}
          onClose={() => setSeriesOpen(false)}
          onSaved={() => { setSeriesOpen(false); void mutate() }}
        />

        {attendanceLesson && (
          <AttendanceDialog
            lesson={attendanceLesson}
            onClose={() => setAttendanceLesson(null)}
            onSaved={() => { setAttendanceLesson(null); void mutate() }}
          />
        )}

        <ConfirmDialog
          open={!!deleteLesson}
          onClose={() => setDeleteLesson(null)}
          title="Xoá buổi học"
          description={deleteLesson ? `Buổi "${deleteLesson.title}" sẽ bị huỷ.` : undefined}
          confirmLabel="Xoá"
          submitting={submitting}
          onConfirm={handleDelete}
        />
      </div>
    </div>
  )
}

// ── Dialog tạo buổi lẻ ──
function LessonDialog({
  open,
  students,
  submitting,
  onClose,
  onSaved,
}: {
  open: boolean
  students: Student[]
  submitting: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const { success: notifySuccess, error: notifyError } = useToast()
  const [title, setTitle] = useState('')
  const [coachName, setCoachName] = useState('')
  const [date, setDate] = useState(todayInput())
  const [time, setTime] = useState('18:00')
  const [duration, setDuration] = useState('60')
  const [studentIds, setStudentIds] = useState<string[]>([])
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async () => {
    if (!title.trim()) { notifyError('Nhập tiêu đề buổi học'); return }
    if (studentIds.length === 0) { notifyError('Chọn ít nhất 1 học viên'); return }
    const startsAt = new Date(`${date}T${time}:00`)
    setSaving(true)
    try {
      const data = await apiJson<{ lesson: Lesson; googleSynced: boolean; warning?: string }>('/api/lessons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), coachName: coachName.trim() || undefined, startsAt: startsAt.toISOString(), durationMin: Number(duration) || 60, studentIds, note: note.trim() || undefined }),
      })
      if (!data.success) {
        notifyError(data.error || 'Không tạo được buổi học')
        return
      }
      notifySuccess('Đã tạo buổi học')
      if (data.data?.warning) notifyError(data.data.warning)
      onSaved()
    } catch {
      notifyError('Lỗi kết nối máy chủ')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Thêm buổi học"
      size="md"
      footer={
        <Button variant="inverse" size="lg" fullWidth disabled={saving || !title.trim() || studentIds.length === 0} onClick={handleSubmit}>
          {saving ? 'Đang lưu...' : 'Tạo buổi học'}
        </Button>
      }
    >
      <div className="space-y-3">
        <div>
          <Label htmlFor="lesson-title" required>Tiêu đề</Label>
          <Input id="lesson-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="VD: Buổi 1 — Nhập môn cung" />
        </div>
        <div>
          <Label htmlFor="lesson-coach">HLV</Label>
          <Input id="lesson-coach" value={coachName} onChange={(e) => setCoachName(e.target.value)} placeholder="Tên HLV (tuỳ chọn)" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label htmlFor="lesson-date" required>Ngày</Label>
            <Input id="lesson-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="lesson-time" required>Giờ</Label>
            <Input id="lesson-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
        </div>
        <div>
          <Label htmlFor="lesson-duration">Thời lượng (phút)</Label>
          <Input id="lesson-duration" type="number" min={1} value={duration} onChange={(e) => setDuration(e.target.value)} />
        </div>
        <div>
          <Label required>Học viên</Label>
          <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-zinc-200 p-2 dark:border-zinc-700">
            {students.map((s) => (
              <label key={s.id} className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-800">
                <input
                  type="checkbox"
                  checked={studentIds.includes(s.id)}
                  onChange={(e) => setStudentIds((prev) => e.target.checked ? [...prev, s.id] : prev.filter((x) => x !== s.id))}
                  className="h-4 w-4 rounded border-zinc-300 text-blue-600"
                />
                <span className="text-sm text-zinc-800 dark:text-zinc-200">{s.fullName}</span>
              </label>
            ))}
            {students.length === 0 && <p className="px-2 py-1 text-xs text-zinc-500">Chưa có học viên nào. Hãy thêm học viên trước.</p>}
          </div>
        </div>
        <div>
          <Label htmlFor="lesson-note">Ghi chú</Label>
          <Textarea id="lesson-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ghi chú buổi (tuỳ chọn)" rows={2} />
        </div>
      </div>
    </Modal>
  )
}

// ── Dialog tạo lịch lặp ──
function SeriesDialog({
  open,
  students,
  submitting,
  onClose,
  onSaved,
}: {
  open: boolean
  students: Student[]
  submitting: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const { success: notifySuccess, error: notifyError } = useToast()
  const [title, setTitle] = useState('')
  const [coachName, setCoachName] = useState('')
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([1, 3])
  const [time, setTime] = useState('18:00')
  const [duration, setDuration] = useState('60')
  const [startsOn, setStartsOn] = useState(todayInput())
  const [endsOn, setEndsOn] = useState('')
  const [studentIds, setStudentIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  const toggleDay = (d: number) =>
    setDaysOfWeek((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d])

  const handleSubmit = async () => {
    if (!title.trim()) { notifyError('Nhập tiêu đề lịch học'); return }
    if (daysOfWeek.length === 0) { notifyError('Chọn ít nhất 1 ngày trong tuần'); return }
    if (studentIds.length === 0) { notifyError('Chọn ít nhất 1 học viên'); return }
    setSaving(true)
    try {
      const data = await apiJson<{ series: unknown; generatedCount: number; warning?: string }>('/api/series', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          coachName: coachName.trim() || undefined,
          daysOfWeek,
          startTime: time,
          durationMin: Number(duration) || 60,
          startsOn,
          endsOn: endsOn || null,
          studentIds,
        }),
      })
      if (!data.success) {
        notifyError(data.error || 'Không tạo được lịch học')
        return
      }
      notifySuccess(`Đã tạo lịch học (${data.data?.generatedCount ?? 0} buổi)`)
      if (data.data?.warning) notifyError(data.data.warning)
      onSaved()
    } catch {
      notifyError('Lỗi kết nối máy chủ')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Tạo lịch học lặp lại"
      description="Tự động tạo các buổi học theo ngày trong tuần."
      size="md"
      footer={
        <Button variant="inverse" size="lg" fullWidth disabled={saving || !title.trim() || daysOfWeek.length === 0 || studentIds.length === 0} onClick={handleSubmit}>
          {saving ? 'Đang tạo...' : 'Tạo lịch học'}
        </Button>
      }
    >
      <div className="space-y-3">
        <div>
          <Label htmlFor="series-title" required>Tiêu đề</Label>
          <Input id="series-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="VD: Lớp cung cơ bản" />
        </div>
        <div>
          <Label htmlFor="series-coach">HLV</Label>
          <Input id="series-coach" value={coachName} onChange={(e) => setCoachName(e.target.value)} placeholder="Tên HLV (tuỳ chọn)" />
        </div>
        <div>
          <Label required>Ngày trong tuần</Label>
          <div className="flex flex-wrap gap-1.5">
            {DAY_NAMES.map((name, d) => (
              <button
                key={d}
                type="button"
                aria-pressed={daysOfWeek.includes(d)}
                onClick={() => toggleDay(d)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  daysOfWeek.includes(d)
                    ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/15 dark:text-blue-300'
                    : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400'
                }`}
              >
                {name}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label htmlFor="series-time" required>Giờ</Label>
            <Input id="series-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="series-duration">Thời lượng (phút)</Label>
            <Input id="series-duration" type="number" min={1} value={duration} onChange={(e) => setDuration(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label htmlFor="series-start" required>Bắt đầu</Label>
            <Input id="series-start" type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="series-end">Kết thúc (tuỳ chọn)</Label>
            <Input id="series-end" type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
          </div>
        </div>
        <div>
          <Label required>Học viên</Label>
          <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-zinc-200 p-2 dark:border-zinc-700">
            {students.map((s) => (
              <label key={s.id} className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-800">
                <input
                  type="checkbox"
                  checked={studentIds.includes(s.id)}
                  onChange={(e) => setStudentIds((prev) => e.target.checked ? [...prev, s.id] : prev.filter((x) => x !== s.id))}
                  className="h-4 w-4 rounded border-zinc-300 text-blue-600"
                />
                <span className="text-sm text-zinc-800 dark:text-zinc-200">{s.fullName}</span>
              </label>
            ))}
            {students.length === 0 && <p className="px-2 py-1 text-xs text-zinc-500">Chưa có học viên nào.</p>}
          </div>
        </div>
      </div>
    </Modal>
  )
}

// ── Dialog điểm danh + note từng học viên ──
function AttendanceDialog({
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
            note: entries[ls.studentId]?.note || undefined,
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
      description={fmtDate(lesson.startsAt)}
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
