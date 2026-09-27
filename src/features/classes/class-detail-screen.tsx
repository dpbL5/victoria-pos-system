'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, CalendarClock, Edit3, Plus, StopCircle, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input, Label, Select, Textarea } from '@/components/ui/input'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Modal } from '@/components/ui/modal'
import { NoticeCard } from '@/components/ui/notice-card'
import { AppSkeleton } from '@/components/ui/skeleton'
import { SortableCardList, type Column as CardColumn } from '@/components/ui/sortable-card-list'
import { SortableTable } from '@/components/ui/sortable-table'
import { useToast } from '@/components/ui/toast'
import { useApi } from '@/hooks/use-api'
import { apiJson } from '@/lib/api'
import { usePageRefresh } from '@/components/layout/page-refresh-context'
import { StudentPicker } from '@/features/students/student-picker'
import { emptySchedule, scheduleBody, scheduleError, ScheduleFields, scheduleToForm, type ScheduleFormState } from '@/features/students/schedule-fields'
import type { Lesson } from '@/features/students/types'
import { formatVnDate, formatVnTimeRange } from '@/lib/shared/utils'
import { formatDate, formatSlot, todayInput } from './slot-form'
import type { ClassDetail, ClassSlot } from './types'

export function ClassDetailScreen({ id }: { id: string }) {
  const { success: notifySuccess, error: notifyError } = useToast()
  const router = useRouter()
  const { data, isLoading, mutate } = useApi<ClassDetail>(`/api/classes/${id}`)
  const from = todayInput()
  const toDate = new Date(`${from}T00:00:00Z`)
  toDate.setUTCDate(toDate.getUTCDate() + 84)
  const to = toDate.toISOString().slice(0, 10)
  const { data: lessonData, isLoading: lessonsLoading, mutate: mutateLessons } = useApi<{ lessons: Lesson[]; warning?: string }>(
    `/api/lessons?from=${from}&to=${to}&classId=${id}`,
  )
  const { registerRefresh } = usePageRefresh()
  const [infoOpen, setInfoOpen] = useState(false)
  const [slotTarget, setSlotTarget] = useState<ClassSlot | 'new' | null>(null)
  const [endSlotTarget, setEndSlotTarget] = useState<ClassSlot | null>(null)
  const [endOpen, setEndOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [rosterIds, setRosterIds] = useState<string[] | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const detail = data?.data
  const error = data && !data.success ? (data.error ?? '') : ''
  const slots = detail?.slots ?? []
  const selectedStudents = rosterIds ?? detail?.roster.map(student => student.id) ?? []
  const rosterChanged = rosterIds !== null && rosterIds.join() !== (detail?.roster.map(student => student.id).join() ?? '')
  const lessons = lessonData?.success ? lessonData.data?.lessons ?? [] : []
  const lessonsError = lessonData && !lessonData.success ? lessonData.error : ''
  const rosterColumns: CardColumn<ClassDetail['roster'][number]>[] = [
    {
      key: 'fullName',
      label: 'Học viên',
      render: student => <Link href={`/students/${student.id}`} className="font-medium text-zinc-950 hover:text-blue-700 hover:underline dark:text-white dark:hover:text-blue-300">{student.fullName}</Link>,
    },
    { key: 'phone', label: 'SĐT', render: student => student.phone || '—' },
  ]

  async function refreshData() {
    await Promise.all([mutate(), mutateLessons()])
  }

  useEffect(() => {
    return registerRefresh(() => void Promise.all([mutate(), mutateLessons()]))
  }, [registerRefresh, mutate, mutateLessons])


  async function saveInfo(payload: { name: string; coachName: string; note: string }) {
    setSubmitting(true)
    try {
      const result = await apiJson(`/api/classes/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (!result.success) {
        notifyError(result.error || 'Không lưu được lớp học')
        return
      }
      notifySuccess('Đã cập nhật lớp học')
      setInfoOpen(false)
      await refreshData()
    } catch {
      notifyError('Lỗi kết nối máy chủ')
    } finally {
      setSubmitting(false)
    }
  }

  async function saveRoster() {
    setSubmitting(true)
    try {
      const result = await apiJson<{ updatedLessons: number; skippedLocked: number }>(`/api/classes/${id}/students`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentIds: selectedStudents }),
      })
      if (!result.success) {
        notifyError(result.error || 'Không lưu được sổ học viên')
        return
      }
      const skipped = result.data?.skippedLocked ?? 0
      notifySuccess(skipped ? `Đã lưu sổ học viên · bỏ qua ${skipped} buổi đã điểm danh` : 'Đã lưu sổ học viên')
      setRosterIds(null)
      await refreshData()
    } catch {
      notifyError('Lỗi kết nối máy chủ')
    } finally {
      setSubmitting(false)
    }
  }

  async function saveSlot(scope: 'FOLLOWING' | 'ALL', form: ScheduleFormState) {
    const body = scheduleBody(form)
    if (!body) {
      notifyError(scheduleError(form) ?? 'Lịch chưa hợp lệ')
      return
    }
    setSubmitting(true)
    try {
      const result = slotTarget === 'new'
        ? await apiJson(`/api/classes/${id}/slots`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        : await apiJson(`/api/classes/${id}/slots/${(slotTarget as ClassSlot).id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, version: (slotTarget as ClassSlot).version, scope }) })
      if (!result.success) {
        notifyError(result.error || 'Không lưu được lịch lặp')
        return
      }
      notifySuccess(slotTarget === 'new' ? 'Đã thêm lịch lặp' : 'Đã cập nhật lịch lặp')
      setSlotTarget(null)
      await refreshData()
    } catch {
      notifyError('Lỗi kết nối máy chủ')
    } finally {
      setSubmitting(false)
    }
  }

  async function endSlot() {
    if (!endSlotTarget) return
    setSubmitting(true)
    try {
      const result = await apiJson(`/api/classes/${id}/slots/${endSlotTarget.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: endSlotTarget.version, scope: 'FOLLOWING' }),
      })
      if (!result.success) {
        notifyError(result.error || 'Không kết thúc được lịch lặp')
        return
      }
      notifySuccess('Đã kết thúc lịch lặp từ hôm nay')
      setEndSlotTarget(null)
      await refreshData()
    } catch {
      notifyError('Lỗi kết nối máy chủ')
    } finally {
      setSubmitting(false)
    }
  }

  async function endClass() {
    setSubmitting(true)
    try {
      const result = await apiJson(`/api/classes/${id}/end`, { method: 'POST' })
      if (!result.success) {
        notifyError(result.error || 'Không kết thúc được lớp')
        return
      }
      notifySuccess('Đã kết thúc lớp và huỷ các buổi tương lai')
      setEndOpen(false)
      await refreshData()
    } catch {
      notifyError('Lỗi kết nối máy chủ')
    } finally {
      setSubmitting(false)
    }
  }

  async function deleteClass() {
    setSubmitting(true)
    try {
      const result = await apiJson(`/api/classes/${id}`, { method: 'DELETE' })
      if (!result.success) {
        notifyError(result.error || 'Không xoá được lớp')
        return
      }
      notifySuccess('Đã xoá lớp học')
      setDeleteOpen(false)
      router.push('/classes')
    } catch {
      notifyError('Lỗi kết nối máy chủ')
    } finally {
      setSubmitting(false)
    }
  }

  if (isLoading) {
    return <AppSkeleton />
  }

  if (!detail) {
    return <div className="p-4"><NoticeCard tone="danger" title="Không tải được lớp học" description={error || 'Lớp không tồn tại hoặc đã bị xoá'} /><Link href="/classes" className="mt-3 inline-block text-sm text-blue-700 hover:underline dark:text-blue-300">Về danh sách lớp</Link></div>
  }

  return <div className="min-h-full bg-zinc-50 px-4 py-4 dark:bg-zinc-950 md:px-6 md:py-6">
    <div className="mx-auto max-w-content space-y-4">
      <div className="flex items-center gap-2">
        <Link href="/classes" className="inline-flex items-center gap-1 text-sm text-zinc-600 hover:underline dark:text-zinc-300"><ArrowLeft size={16} />Danh sách lớp</Link>
      </div>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold text-zinc-950 dark:text-white">
            {detail.name}
            {detail.isActive ? <Badge variant="success">Đang hoạt động</Badge> : <Badge variant="default">Đã kết thúc</Badge>}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" icon={CalendarClock} onClick={() => router.push(`/lessons?classId=${id}`)}>Xem lịch</Button>
          <Button variant="secondary" size="sm" icon={Edit3} onClick={() => setInfoOpen(true)}>Sửa thông tin</Button>
          {detail.isActive && <Button variant="outline-danger" size="sm" icon={StopCircle} onClick={() => setEndOpen(true)}>Kết thúc lớp</Button>}
          <Button variant="outline-danger" size="sm" icon={Trash2} onClick={() => setDeleteOpen(true)} title="Xoá lớp thêm nhầm">Xoá lớp</Button>
        </div>
      </header>

      {error && <NoticeCard tone="danger" title="Không tải được lớp học" description={error} />}

      <section className="space-y-3">
        <div className="space-y-3">
          <h2 className="font-semibold text-zinc-950 dark:text-white">Thông tin lớp</h2>
          <dl className="flex flex-wrap gap-x-8 gap-y-3 border-b border-zinc-200 pb-4 dark:border-zinc-800">
            <div><dt className="text-xs text-zinc-500 dark:text-zinc-400">Huấn luyện viên</dt><dd className="mt-0.5 text-sm font-medium text-zinc-900 dark:text-white">{detail.coachName || 'Chưa phân công'}</dd></div>
            <div><dt className="text-xs text-zinc-500 dark:text-zinc-400">Lịch lặp</dt><dd className="mt-0.5 text-sm font-medium text-zinc-900 dark:text-white">{slots.length}</dd></div>
          </dl>
          {detail.note && <p className="whitespace-pre-wrap text-sm text-zinc-600 dark:text-zinc-300">{detail.note}</p>}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <section className="space-y-3">
          <h2 className="font-semibold text-zinc-950 dark:text-white">Sổ học viên <span className="font-normal text-zinc-500 dark:text-zinc-400">({detail.roster.length})</span></h2>
          <div className="md:hidden">
            <SortableCardList
              columns={rosterColumns}
              data={detail.roster}
              keyExtractor={student => student.id}
              sortableKeys={['fullName']}
              defaultSortKey="fullName"
              defaultSortDir="asc"
              emptyMessage="Lớp chưa có học viên"
              emptyDescription="Học viên được xếp vào lớp sẽ xuất hiện ở đây."
              search={{ placeholder: 'Tìm học viên', getText: student => `${student.fullName} ${student.phone ?? ''}` }}
            />
          </div>
          <div className="hidden md:block">
            <SortableTable
              columns={rosterColumns}
              data={detail.roster}
              keyExtractor={student => student.id}
              sortableKeys={['fullName']}
              defaultSortKey="fullName"
              defaultSortDir="asc"
              emptyMessage="Lớp chưa có học viên"
              emptyDescription="Học viên được xếp vào lớp sẽ xuất hiện ở đây."
              search={{ placeholder: 'Tìm học viên', getText: student => `${student.fullName} ${student.phone ?? ''}` }}
            />
          </div>
          {detail.isActive && <details className="group rounded-lg border border-zinc-200 bg-white px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-900">
            <summary className="w-fit cursor-pointer text-sm font-medium text-zinc-600 hover:text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-zinc-300 dark:hover:text-white">Chỉnh sửa sổ học viên</summary>
            <div className="mt-3 space-y-3 border-t border-zinc-200 pt-3 dark:border-zinc-800">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Thay đổi áp dụng cho lịch lặp và các buổi chưa điểm danh.</p>
              <StudentPicker key={detail.id} value={selectedStudents} disabled={submitting} onChange={setRosterIds} initial={detail.roster} availableForClassId={detail.id} />
              <div className="flex justify-end">
                <Button variant="primary" size="sm" disabled={submitting || !rosterChanged} onClick={() => void saveRoster()}>{submitting ? 'Đang lưu...' : 'Lưu thay đổi'}</Button>
              </div>
            </div>
          </details>}
        </section>

        <section className="space-y-3 rounded-xl bg-white p-4 ring-1 ring-border-default dark:bg-zinc-900">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-semibold text-zinc-950 dark:text-white">Buổi học sắp tới</h2>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">Trong 12 tuần tới</span>
          </div>
          {lessonData?.success && lessonData.data?.warning && <NoticeCard tone="warning" title="Lịch chưa được sinh đầy đủ" description={lessonData.data.warning} />}
          {lessonsError
            ? <NoticeCard tone="danger" title="Không tải được lịch học" description={lessonsError} />
            : lessonsLoading
              ? <p className="py-2 text-sm text-zinc-500 dark:text-zinc-400">Đang tải lịch học...</p>
              : lessons.length
                ? <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {lessons.map(lesson => (
                    <li key={lesson.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0">
                      <div className="flex min-w-0 flex-1 items-start gap-4">
                        <div className="w-24 shrink-0">
                          <p className="text-sm font-medium text-zinc-950 dark:text-white">{formatVnDate(lesson.startsAt)}</p>
                          <p className="mt-0.5 text-xs tabular-nums text-zinc-500 dark:text-zinc-400">{formatVnTimeRange(lesson.startsAt, lesson.durationMin)}</p>
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">{lesson.title}</p>
                          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                            {lesson.coachName ? `${lesson.coachName} · ` : ''}{lesson.students.length} học viên
                          </p>
                        </div>
                      </div>
                      <Badge variant={lesson.status === 'COMPLETED' ? 'success' : 'default'}>
                        {lesson.status === 'COMPLETED' ? 'Đã học' : 'Sắp diễn ra'}
                      </Badge>
                    </li>
                  ))}
                </ul>
                : <p className="py-2 text-sm text-zinc-500 dark:text-zinc-400">Chưa có buổi học trong 12 tuần tới.</p>}
        </section>
      </div>

      <section className="space-y-3 rounded-xl bg-white p-4 ring-1 ring-border-default dark:bg-zinc-900">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-zinc-950 dark:text-white">Lịch lặp của lớp</h2>
          {detail.isActive && <Button variant="secondary" size="sm" icon={Plus} onClick={() => setSlotTarget('new')}>Thêm lịch lặp</Button>}
        </div>
        <div className="space-y-2">
          {slots.map(slot => (
            <div key={slot.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-medium text-zinc-950 dark:text-white"><CalendarClock size={16} />{formatSlot(slot)}{slot.isActive ? '' : ' · đã kết thúc'}</p>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Từ {formatDate(slot.startsOn)} → {formatDate(slot.endsOn)} · {slot.students.length} học viên</p>
              </div>
              <div className="flex gap-1.5">
                {detail.isActive && <Button variant="secondary" size="sm" icon={Edit3} disabled={submitting} onClick={() => setSlotTarget(slot)} title="Sửa lịch lặp" />}
                {detail.isActive && slot.isActive && <Button variant="outline-danger" size="sm" icon={StopCircle} disabled={submitting} onClick={() => setEndSlotTarget(slot)} title="Kết thúc lịch lặp" />}
              </div>
            </div>
          ))}
          {!slots.length && <p className="text-sm text-zinc-500 dark:text-zinc-400">Lớp chưa có lịch lặp. Thêm lịch lặp để sinh buổi học hằng tuần.</p>}
        </div>
      </section>
    </div>

    {infoOpen && <ClassInfoModal key={detail.id} lessonClass={detail} submitting={submitting} onClose={() => setInfoOpen(false)} onSubmit={saveInfo} />}

    {slotTarget !== null && <SlotModal key={slotTarget === 'new' ? 'new' : slotTarget.id} slot={slotTarget === 'new' ? null : slotTarget} submitting={submitting} onClose={() => setSlotTarget(null)} onSubmit={saveSlot} />}

    <ConfirmDialog
      open={!!endSlotTarget}
      onClose={() => setEndSlotTarget(null)}
      title="Kết thúc lịch lặp?"
      description={endSlotTarget ? `Lịch ${formatSlot(endSlotTarget)} sẽ ngừng sinh buổi mới từ hôm nay và các buổi chưa diễn ra bị huỷ. Lịch sử được giữ lại.` : undefined}
      confirmLabel="Kết thúc lịch lặp"
      submitting={submitting}
      onConfirm={endSlot}
    />

    <ConfirmDialog
      open={endOpen}
      onClose={() => setEndOpen(false)}
      title="Kết thúc lớp học?"
      description={`Lớp "${detail.name}" sẽ chuyển sang trạng thái đã kết thúc và toàn bộ buổi chưa diễn ra bị huỷ. Lịch sử được giữ lại.`}
      confirmLabel="Kết thúc lớp"
      submitting={submitting}
      onConfirm={endClass}
    />

    <ConfirmDialog
      open={deleteOpen}
      onClose={() => setDeleteOpen(false)}
      title="Xoá lớp học?"
      description={`Chỉ xoá được lớp "${detail.name}" khi chưa có điểm danh hoặc ghi chú. Nếu lớp đã hoạt động, hãy kết thúc lớp để giữ lại lịch sử học viên.`}
      confirmLabel="Xoá lớp"
      submitting={submitting}
      onConfirm={deleteClass}
    />
  </div>
}

function ClassInfoModal({ lessonClass, submitting, onClose, onSubmit }: {
  lessonClass: ClassDetail
  submitting: boolean
  onClose: () => void
  onSubmit: (payload: { name: string; coachName: string; note: string }) => Promise<void>
}) {
  const [name, setName] = useState(lessonClass.name)
  const [coachName, setCoachName] = useState(lessonClass.coachName ?? '')
  const [note, setNote] = useState(lessonClass.note ?? '')

  return <Modal open onClose={onClose} title="Sửa thông tin lớp" size="md" footer={
    <Button variant="inverse" size="lg" fullWidth disabled={submitting || !name.trim()} onClick={() => void onSubmit({ name: name.trim(), coachName: coachName.trim(), note: note.trim() })}>
      {submitting ? 'Đang lưu...' : 'Cập nhật'}
    </Button>
  }>
    <div className="space-y-3">
      <div><Label htmlFor="class-info-name" required>Tên lớp</Label><Input autoFocus id="class-info-name" maxLength={150} value={name} onChange={event => setName(event.target.value)} /></div>
      <div><Label htmlFor="class-info-coach">Huấn luyện viên</Label><Input id="class-info-coach" maxLength={100} value={coachName} onChange={event => setCoachName(event.target.value)} /></div>
      <div><Label htmlFor="class-info-note">Ghi chú</Label><Textarea id="class-info-note" rows={3} maxLength={2000} value={note} onChange={event => setNote(event.target.value)} /></div>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">Đổi tên lớp sẽ cập nhật tiêu đề các lịch lặp và buổi chưa điểm danh.</p>
    </div>
  </Modal>
}

function SlotModal({ slot, submitting, onClose, onSubmit }: {
  slot: ClassSlot | null
  submitting: boolean
  onClose: () => void
  onSubmit: (scope: 'FOLLOWING' | 'ALL', form: ScheduleFormState) => Promise<void>
}) {
  const [form, setForm] = useState<ScheduleFormState>(() => slot ? scheduleToForm(slot) : emptySchedule(todayInput()))
  const [scope, setScope] = useState<'FOLLOWING' | 'ALL'>('FOLLOWING')

  const error = scheduleError(form)

  return <Modal open onClose={onClose} title={slot ? 'Sửa lịch lặp' : 'Thêm lịch lặp'} size="md" footer={
    <Button variant="inverse" size="lg" fullWidth disabled={submitting || Boolean(error)} onClick={() => void onSubmit(scope, form)}>
      {submitting ? 'Đang lưu...' : slot ? 'Cập nhật lịch' : 'Thêm lịch'}
    </Button>
  }>
    <div className="space-y-4">
      <ScheduleFields idPrefix={slot ? `slot-${slot.id}` : 'slot-new'} form={form} onChange={setForm} />
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {slot && <div>
        <Label htmlFor="slot-scope">Phạm vi thay đổi</Label>
        <Select id="slot-scope" value={scope} onChange={event => setScope(event.target.value as 'FOLLOWING' | 'ALL')}>
          <option value="FOLLOWING">Từ buổi sắp tới trở đi</option>
          <option value="ALL">Toàn bộ chuỗi (giữ lịch sử)</option>
        </Select>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Buổi đã điểm danh không bị đổi lịch; nếu có buổi như vậy, hãy xử lý riêng trên lịch.</p>
      </div>}
      {!slot && <p className="text-xs text-zinc-500 dark:text-zinc-400">Lịch dùng sổ học viên hiện tại của lớp. Sinh buổi tối đa 12 tuần tới.</p>}
    </div>
  </Modal>
}
