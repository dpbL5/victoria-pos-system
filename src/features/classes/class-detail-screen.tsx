'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, CalendarClock, Edit3, Plus, School, StopCircle, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
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
import { PAGE_TITLE_CLASS } from '@/components/ui/page-title'
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
  const [submitting, setSubmitting] = useState(false)

  const detail = data?.data
  const error = data && !data.success ? (data.error ?? '') : ''
  const slots = detail?.slots ?? []
  const lessons = lessonData?.success ? lessonData.data?.lessons ?? [] : []
  const lessonsError = lessonData && !lessonData.success ? lessonData.error : ''
  const rosterColumns: CardColumn<ClassDetail['roster'][number]>[] = [
    {
      key: 'fullName',
      label: 'Học viên',
      render: student => <Link href={`/students/${student.id}`} className="font-medium text-text-primary hover:text-info hover:underline">{student.fullName}</Link>,
    },
    { key: 'phone', label: 'SĐT', render: student => student.phone || '—' },
  ]

  async function refreshData() {
    await Promise.all([mutate(), mutateLessons()])
  }

  useEffect(() => {
    return registerRefresh(() => void Promise.all([mutate(), mutateLessons()]))
  }, [registerRefresh, mutate, mutateLessons])


  async function saveInfo(payload: { name: string; coachName: string; note: string }, studentIds: string[]) {
    setSubmitting(true)
    try {
      const result = await apiJson(`/api/classes/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (!result.success) {
        notifyError(result.error || 'Không lưu được lớp học')
        return
      }
      const rosterChanged = detail && studentIds.join() !== detail.roster.map(student => student.id).join()
      if (detail?.isActive && rosterChanged) {
        const roster = await apiJson<{ skippedLocked: number }>(`/api/classes/${id}/students`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ studentIds }),
        })
        if (!roster.success) {
          notifyError(roster.error || 'Không lưu được sổ học viên')
          await refreshData()
          return
        }
        const skipped = roster.data?.skippedLocked ?? 0
        notifySuccess(skipped ? `Đã cập nhật lớp học · bỏ qua ${skipped} buổi đã điểm danh` : 'Đã cập nhật lớp học')
      } else {
        notifySuccess('Đã cập nhật lớp học')
      }
      setInfoOpen(false)
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
    return <div className="p-4"><NoticeCard tone="danger" title="Không tải được lớp học" description={error || 'Lớp không tồn tại hoặc đã bị xoá'} /><Link href="/classes" className="mt-3 inline-block text-sm text-info hover:underline text-info">Về danh sách lớp</Link></div>
  }

  const rosterHeader = (
    <div>
      <h2 className="text-sm font-semibold text-text-primary">Sổ học viên</h2>
      <p className="mt-0.5 text-xs text-text-tertiary">{detail.roster.length} học viên · bấm tên để xem lịch học</p>
    </div>
  )

  return <div className="min-h-full bg-surface-secondary px-4 py-4 md:px-6 md:py-6">
    <div className="mx-auto max-w-content space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Button variant="ghost" size="sm" icon={ArrowLeft} onClick={() => router.push('/classes')} title="Danh sách lớp" />
          <h1 className={`flex min-w-0 flex-wrap items-center gap-2 ${PAGE_TITLE_CLASS}`}>
            <School size={24} className="text-warning" />
            {detail.name}
            {detail.isActive ? <Badge variant="success">Đang hoạt động</Badge> : <Badge variant="default">Đã kết thúc</Badge>}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="white" size="sm" icon={CalendarClock} onClick={() => router.push(`/lessons?classId=${id}`)}>Xem lịch</Button>
          <Button variant="white" size="sm" icon={Edit3} onClick={() => setInfoOpen(true)}>Sửa thông tin</Button>
          {detail.isActive && <Button variant="red" size="sm" icon={StopCircle} onClick={() => setEndOpen(true)}>Kết thúc lớp</Button>}
          <Button variant="red" size="sm" icon={Trash2} onClick={() => setDeleteOpen(true)} title="Xoá lớp thêm nhầm">Xoá lớp</Button>
        </div>
      </header>

      {error && <NoticeCard tone="danger" title="Không tải được lớp học" description={error} />}

      <Card padding="md" className="space-y-3">
        <h2 className="text-sm font-semibold text-text-primary">Thông tin lớp</h2>
        <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <div><dt className="text-xs text-text-tertiary">Huấn luyện viên</dt><dd className="font-medium">{detail.coachName || 'Chưa phân công'}</dd></div>
          <div><dt className="text-xs text-text-tertiary">Lịch lặp</dt><dd className="font-medium tabular-nums">{slots.length} khung giờ</dd></div>
          <div className="sm:col-span-2"><dt className="text-xs text-text-tertiary">Ghi chú</dt><dd className="whitespace-pre-wrap font-medium">{detail.note || '—'}</dd></div>
        </dl>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <section className="order-1 space-y-3 lg:order-1">
          <div className="md:hidden">
            <SortableCardList
              header={rosterHeader}
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
              header={rosterHeader}
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
        </section>

        <Card padding="md" className="order-3 space-y-3 lg:order-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-text-primary">Lịch lặp của lớp</h2>
            {detail.isActive && <Button variant="contrast" size="sm" icon={Plus} onClick={() => setSlotTarget('new')}>Thêm lịch lặp</Button>}
          </div>
          <div className="space-y-2">
            {slots.map(slot => (
              <div key={slot.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border-default p-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-medium text-text-primary"><CalendarClock size={16} />{formatSlot(slot)}{slot.isActive ? '' : ' · đã kết thúc'}</p>
                  <p className="mt-1 text-xs tabular-nums text-text-tertiary">Từ {formatDate(slot.startsOn)} → {formatDate(slot.endsOn)} · {slot.students.length} học viên</p>
                </div>
                <div className="flex gap-1.5">
                  {detail.isActive && <Button variant="white" size="sm" icon={Edit3} disabled={submitting} onClick={() => setSlotTarget(slot)} title="Sửa lịch lặp" />}
                  {detail.isActive && slot.isActive && <Button variant="red-soft" size="sm" icon={StopCircle} disabled={submitting} onClick={() => setEndSlotTarget(slot)} title="Kết thúc lịch lặp" />}
                </div>
              </div>
            ))}
            {!slots.length && <p className="text-sm text-text-tertiary">Lớp chưa có lịch lặp. Thêm lịch lặp để sinh buổi học hằng tuần.</p>}
          </div>
        </Card>

        <section className="order-2 space-y-3 lg:order-3 lg:col-span-2">
          {lessonData?.success && lessonData.data?.warning && <NoticeCard tone="warning" title="Lịch chưa được sinh đầy đủ" description={lessonData.data.warning} />}
          {lessonsError ? <NoticeCard tone="danger" title="Không tải được lịch học" description={lessonsError} /> : (
            <Card padding="none">
              <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3">
                <h2 className="text-sm font-semibold text-text-primary">Buổi học sắp tới</h2>
                <span className="text-xs text-text-tertiary">{lessonsLoading ? 'Trong 12 tuần tới' : `${lessons.length} buổi · Trong 12 tuần tới`}</span>
              </div>
              {lessonsLoading
                ? <p className="px-4 pb-4 text-sm text-text-tertiary">Đang tải lịch học...</p>
                : lessons.length
                  ? <ul className="max-h-96 divide-y divide-border-default overflow-y-auto border-t border-border-default">
                    {lessons.map(lesson => (
                      <li key={lesson.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-text-primary">{lesson.title}</p>
                          <p className="mt-0.5 text-xs tabular-nums text-text-tertiary">
                            {formatVnDate(lesson.startsAt)} · {formatVnTimeRange(lesson.startsAt, lesson.durationMin)}{lesson.coachName ? ` · ${lesson.coachName}` : ''} · {lesson.students.length} học viên
                          </p>
                        </div>
                        <Badge variant={lesson.status === 'COMPLETED' ? 'success' : 'default'}>
                          {lesson.status === 'COMPLETED' ? 'Đã học' : 'Sắp diễn ra'}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                  : <p className="px-4 pb-4 text-sm text-text-tertiary">Chưa có buổi học trong 12 tuần tới.</p>}
            </Card>
          )}
        </section>
      </div>
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
  onSubmit: (payload: { name: string; coachName: string; note: string }, studentIds: string[]) => Promise<void>
}) {
  const [name, setName] = useState(lessonClass.name)
  const [coachName, setCoachName] = useState(lessonClass.coachName ?? '')
  const [note, setNote] = useState(lessonClass.note ?? '')
  const [rosterIds, setRosterIds] = useState<string[] | null>(null)
  const selectedStudents = rosterIds ?? lessonClass.roster.map(student => student.id)

  return <Modal open onClose={onClose} title="Sửa thông tin lớp" size="md" footer={
  <Button variant="contrast" size="lg" fullWidth disabled={submitting || !name.trim()} onClick={() => void onSubmit({ name: name.trim(), coachName: coachName.trim(), note: note.trim() }, selectedStudents)}>
      {submitting ? 'Đang lưu...' : 'Cập nhật'}
    </Button>
  }>
    <div className="space-y-3">
      <div><Label htmlFor="class-info-name" required>Tên lớp</Label><Input autoFocus id="class-info-name" maxLength={150} value={name} onChange={event => setName(event.target.value)} /></div>
      <div><Label htmlFor="class-info-coach">Huấn luyện viên</Label><Input id="class-info-coach" maxLength={100} value={coachName} onChange={event => setCoachName(event.target.value)} /></div>
      <div><Label htmlFor="class-info-note">Ghi chú</Label><Textarea id="class-info-note" rows={3} maxLength={2000} value={note} onChange={event => setNote(event.target.value)} /></div>
      <p className="text-xs text-text-tertiary">Đổi tên lớp sẽ cập nhật tiêu đề các lịch lặp và buổi chưa điểm danh.</p>
      {lessonClass.isActive && <div className="space-y-3 border-t border-border-default pt-3">
        <div>
          <Label required>Sổ học viên</Label>
          <p className="mt-0.5 text-xs text-text-tertiary">Thay đổi áp dụng cho lịch lặp và các buổi chưa điểm danh.</p>
        </div>
        <StudentPicker key={lessonClass.id} value={selectedStudents} disabled={submitting} onChange={setRosterIds} initial={lessonClass.roster} availableForClassId={lessonClass.id} />
      </div>}
    </div>
  </Modal>
}

function SlotModal({ slot, submitting, onClose, onSubmit }: {
  slot: ClassSlot | null
  submitting: boolean
  onClose: () => void
  onSubmit: (scope: 'FOLLOWING' | 'ALL', form: ScheduleFormState) => Promise<void>
}) {
  const [form, setForm] = useState<ScheduleFormState>(() => {
    if (!slot) return { ...emptySchedule(todayInput()), ending: 'DATE', endsOn: '' }
    // Khung giờ cũ từng "không kết thúc": ép chọn ngày kết thúc trước khi lưu.
    const loaded = scheduleToForm(slot)
    return loaded.ending === 'NEVER' ? { ...loaded, ending: 'DATE', endsOn: '' } : loaded
  })
  const [scope, setScope] = useState<'FOLLOWING' | 'ALL'>('FOLLOWING')

  const error = scheduleError(form)

  return <Modal open onClose={onClose} title={slot ? 'Sửa lịch lặp' : 'Thêm lịch lặp'} size="md" footer={
  <Button variant="contrast" size="lg" fullWidth disabled={submitting || Boolean(error)} onClick={() => void onSubmit(scope, form)}>
      {submitting ? 'Đang lưu...' : slot ? 'Cập nhật lịch' : 'Thêm lịch'}
    </Button>
  }>
    <div className="space-y-4">
      <ScheduleFields idPrefix={slot ? `slot-${slot.id}` : 'slot-new'} form={form} onChange={setForm} allowNever={false} />
        {error && <p className="text-sm text-danger">{error}</p>}
      {slot && <div>
        <Label htmlFor="slot-scope">Phạm vi thay đổi</Label>
        <Select id="slot-scope" value={scope} onChange={event => setScope(event.target.value as 'FOLLOWING' | 'ALL')}>
          <option value="FOLLOWING">Từ buổi sắp tới trở đi</option>
          <option value="ALL">Toàn bộ chuỗi (giữ lịch sử)</option>
        </Select>
        <p className="mt-1 text-xs text-text-tertiary">Buổi đã điểm danh không bị đổi lịch; nếu có buổi như vậy, hãy xử lý riêng trên lịch.</p>
      </div>}
      {!slot && <p className="text-xs text-text-tertiary">Lịch dùng sổ học viên hiện tại của lớp. Sinh buổi tối đa 12 tuần tới.</p>}
              </div>
  </Modal>
}
