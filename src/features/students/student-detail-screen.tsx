'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, CalendarClock, ClipboardCheck, GraduationCap, School, UserMinus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Select } from '@/components/ui/input'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { NoticeCard } from '@/components/ui/notice-card'
import { AppSkeleton } from '@/components/ui/skeleton'
import { useToast } from '@/components/ui/toast'
import { useApi } from '@/hooks/use-api'
import { apiJson } from '@/lib/api'
import { formatVnDate, formatVnTimeRange } from '@/lib/shared/utils'
import { usePageRefresh } from '@/components/layout/page-refresh-context'
import { PAGE_TITLE_CLASS } from '@/components/ui/page-title'
import { AttendanceDialog } from './attendance-dialog'
import { StudentLessonNote } from './lesson-notes'
import { emptyStudentForm, studentFormBody, StudentFormModal, studentToForm, type StudentForm } from './student-form-modal'
import { studentClassOf, type Student, type Lesson } from './types'
import type { LessonClass } from '@/features/classes/types'

interface StudentDetailProps {
  id: string
}

export function StudentDetailScreen({ id }: StudentDetailProps) {
  const { success: notifySuccess, error: notifyError } = useToast()
  const router = useRouter()
  const { data: studentData, isLoading, mutate } = useApi<Student>(`/api/students/${id}`)
  const { data: lessonsData, mutate: mutateLessons } = useApi<{ upcoming: Lesson[]; past: Lesson[] }>(`/api/students/${id}/lessons`)
  const { data: classesData } = useApi<{ classes: LessonClass[] }>('/api/classes?status=ACTIVE', { dedupingInterval: 60_000 })

  const { registerRefresh } = usePageRefresh()
  useEffect(() => {
    return registerRefresh(() => void Promise.all([mutate(), mutateLessons()]))
  }, [registerRefresh, mutate, mutateLessons])

  const student = studentData?.data
  const error = studentData && !studentData.success ? (studentData.error ?? '') : ''
  const loading = isLoading
  const upcoming = lessonsData?.data?.upcoming ?? []
  const past = lessonsData?.data?.past ?? []

  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState<StudentForm>(emptyStudentForm())
  const [submitting, setSubmitting] = useState(false)
  const [classPick, setClassPick] = useState('')
  const [leaveClassOpen, setLeaveClassOpen] = useState(false)
  const [attendanceLesson, setAttendanceLesson] = useState<Lesson | null>(null)

  const currentClass = student ? studentClassOf(student) : null

  async function assignClass() {
    if (!classPick || !student) return
    setSubmitting(true)
    try {
      const result = await apiJson<{ updatedLessons: number; skippedLocked: number }>(`/api/classes/${classPick}/students/${student.id}`, { method: 'POST' })
      if (!result.success) {
        notifyError(result.error || 'Không xếp được học viên vào lớp')
        return
      }
      const skipped = result.data?.skippedLocked ?? 0
      notifySuccess(skipped ? `Đã xếp vào lớp · bỏ qua ${skipped} buổi đã điểm danh` : 'Đã xếp học viên vào lớp')
      setClassPick('')
      await Promise.all([mutate(), mutateLessons()])
    } catch {
      notifyError('Lỗi kết nối máy chủ')
    } finally {
      setSubmitting(false)
    }
  }

  async function leaveClass() {
    if (!currentClass || !student) return
    setSubmitting(true)
    try {
      const result = await apiJson<{ updatedLessons: number; skippedLocked: number }>(`/api/classes/${currentClass.id}/students/${student.id}`, { method: 'DELETE' })
      if (!result.success) {
        notifyError(result.error || 'Không rút được học viên khỏi lớp')
        return
      }
      const skipped = result.data?.skippedLocked ?? 0
      notifySuccess(skipped ? `Đã rời lớp · bỏ qua ${skipped} buổi đã điểm danh` : 'Đã rút học viên khỏi lớp')
      setLeaveClassOpen(false)
      await Promise.all([mutate(), mutateLessons()])
    } catch {
      notifyError('Lỗi kết nối máy chủ')
    } finally {
      setSubmitting(false)
    }
  }

  const openEdit = useCallback(() => {
    if (!student) return
    setForm(studentToForm(student))
    setFormOpen(true)
  }, [student])

  const handleSubmit = async () => {
    if (!student) return
    if (!form.fullName.trim()) {
      notifyError('Tên học viên không được để trống')
      return
    }
    setSubmitting(true)
    try {
      const data = await apiJson<Student>(`/api/students/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(studentFormBody(form)),
      })
      if (!data.success) {
        notifyError(data.error || 'Không cập nhật được')
        return
      }
      notifySuccess('Đã cập nhật học viên')
      setFormOpen(false)
      await mutate()
    } catch {
      notifyError('Lỗi kết nối máy chủ')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading && !student) {
    return <AppSkeleton />
  }

  if (!student) {
    return (
    <div className="min-h-full bg-zinc-50 px-4 py-4 dark:bg-zinc-950 md:px-6 md:py-6">
        <div className="mx-auto max-w-content">
          <NoticeCard tone="danger" title="Không tìm thấy học viên" description={error || 'Học viên không tồn tại hoặc đã bị xoá.'} />
        </div>
      </div>
    )
  }

  return (
      <div className="min-h-full bg-zinc-50 px-4 py-4 dark:bg-zinc-950 md:px-6 md:py-6">
      <div className="mx-auto max-w-content space-y-4">
        <header className="flex items-center gap-2">
          <Button variant="ghost" size="sm" icon={ArrowLeft} onClick={() => router.push('/students')} title="Quay lại" />
          <h1 className={`flex items-center gap-2 ${PAGE_TITLE_CLASS}`}>
          <GraduationCap size={24} className="text-warning" />
            {student.fullName}
          </h1>
          {student.status === 'ACTIVE' ? <Badge variant="success">Đang học</Badge> : <Badge variant="default">Dừng học</Badge>}
        </header>

        {/* Profile */}
        <Card padding="md" className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-white">Thông tin</h2>
          <Button variant="white" size="sm" onClick={openEdit}>Sửa</Button>
          </div>
          <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            <div><dt className="text-xs text-zinc-500 dark:text-zinc-400">SĐT</dt><dd className="font-medium">{student.phone || '—'}</dd></div>
            <div><dt className="text-xs text-zinc-500 dark:text-zinc-400">Năm sinh</dt><dd className="font-medium">{student.birthYear || '—'}</dd></div>
            <div className="sm:col-span-2"><dt className="text-xs text-zinc-500 dark:text-zinc-400">Ghi chú</dt><dd className="font-medium">{student.notes || '—'}</dd></div>
          </dl>
        </Card>

        {/* Class — mỗi học viên chỉ thuộc một lớp */}
        <Card padding="md" className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-white">
              <School size={16} /> Lớp học
            </h2>
              {currentClass && <Button variant="red" size="sm" icon={UserMinus} disabled={submitting} onClick={() => setLeaveClassOpen(true)}>Rời lớp</Button>}
          </div>
          {currentClass ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
            <Link href={`/classes/${currentClass.id}`} className="font-medium text-info hover:underline text-info">{currentClass.name}</Link>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">Học viên chỉ thuộc một lớp — bỏ khỏi lớp này trước khi xếp vào lớp khác.</span>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                {/* Bề rộng đặt ở khung bọc: mũi tên của Select bám mép phải khung */}
                <div className="max-w-64">
                  <Select aria-label="Chọn lớp" value={classPick} onChange={(event) => setClassPick(event.target.value)}>
                    <option value="">Chọn lớp…</option>
                    {classesData?.data?.classes?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </Select>
                </div>
              <Button variant="contrast" size="sm" disabled={submitting || !classPick} onClick={() => void assignClass()}>{submitting ? 'Đang lưu...' : 'Xếp vào lớp'}</Button>
            </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Học viên đang ở lớp khác phải rời lớp đó trước khi xếp vào lớp mới.</p>
              </div>
            )}
        </Card>

        {/* Lessons */}
        <Card padding="none">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-white">Lịch học</h2>
          <Button variant="white" size="sm" icon={CalendarClock} onClick={() => router.push(`/lessons?studentId=${id}`)}>Xếp lịch</Button>
          </div>
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
            {upcoming.length === 0 && past.length === 0 && (
              <p className="px-4 py-6 text-sm text-zinc-500 dark:text-zinc-400">Chưa có buổi học nào.</p>
          )}
            {upcoming.map((l) => {
              const row = l.students.find((s) => s.studentId === id)
              return (
                <div key={l.id} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-zinc-900 dark:text-white">{l.title}</p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">{formatVnDate(l.startsAt)} · {formatVnTimeRange(l.startsAt, l.durationMin)}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Badge variant="blue">Sắp tới</Badge>
                    <Button variant="white" size="sm" icon={ClipboardCheck} aria-label="Điểm danh" title="Điểm danh" onClick={() => setAttendanceLesson(l)} />
                  </div>
                </div>
                  {row?.note && (
                    <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">Ghi chú: {row.note}</p>
                  )}
                  {l.status !== 'CANCELLED' && (
                    <div className="mt-1">
                      <StudentLessonNote lessonId={l.id} version={l.version} studentId={id} studentName={student.fullName} note={row?.note ?? null} onSaved={() => void mutateLessons()} />
                    </div>
                  )}
                </div>
              )
            })}
            {past.map((l) => {
              const row = l.students.find((s) => s.studentId === id)
              return (
                <div key={l.id} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-zinc-900 dark:text-white">{l.title}</p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">{formatVnDate(l.startsAt)} · {formatVnTimeRange(l.startsAt, l.durationMin)}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Badge variant={row?.status === 'COMPLETED' ? 'success' : row?.status === 'ABSENT' ? 'danger' : 'default'}>
                        {row?.status === 'COMPLETED' ? 'Hoàn thành' : row?.status === 'ABSENT' ? 'Vắng' : '—'}
                      </Badge>
                    <Button variant="white" size="sm" icon={ClipboardCheck} aria-label="Điểm danh" title="Điểm danh" onClick={() => setAttendanceLesson(l)} />
                  </div>
                    </div>
                  {row?.note && (
                    <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">Ghi chú: {row.note}</p>
                  )}
                  {l.status !== 'CANCELLED' && (
                    <div className="mt-1">
                      <StudentLessonNote lessonId={l.id} version={l.version} studentId={id} studentName={student.fullName} note={row?.note ?? null} onSaved={() => void mutateLessons()} />
                    </div>
                  )}
                    </div>
              )
            })}
          </div>
        </Card>

        <StudentFormModal
          open={formOpen}
          student={student}
          form={form}
          submitting={submitting}
          onChange={setForm}
          onClose={() => setFormOpen(false)}
          onSubmit={() => void handleSubmit()}
        />

        {attendanceLesson && <AttendanceDialog lesson={attendanceLesson} onClose={() => setAttendanceLesson(null)} onSaved={() => { setAttendanceLesson(null); void mutateLessons() }} />}

        <ConfirmDialog
          open={leaveClassOpen}
          onClose={() => setLeaveClassOpen(false)}
          title="Rời lớp học?"
          description={currentClass ? `Học viên sẽ bị bỏ khỏi mọi lịch lặp của lớp "${currentClass.name}" và các buổi chưa điểm danh. Buổi đã điểm danh giữ nguyên.` : undefined}
          confirmLabel="Rời lớp"
          submitting={submitting}
          onConfirm={leaveClass}
        />
      </div>
    </div>
  )
}
