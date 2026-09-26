'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Edit3, Plus, School, StopCircle, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input, Label, Textarea } from '@/components/ui/input'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Modal } from '@/components/ui/modal'
import { NoticeCard } from '@/components/ui/notice-card'
import { AppSkeleton } from '@/components/ui/skeleton'
import { SortableCardList, type Column as CardColumn } from '@/components/ui/sortable-card-list'
import { SortableTable, type Column } from '@/components/ui/sortable-table'
import { useToast } from '@/components/ui/toast'
import { useApi } from '@/hooks/use-api'
import { apiJson } from '@/lib/api'
import { usePageRefresh } from '@/components/layout/page-refresh-context'
import { StudentPicker } from '@/features/students/student-picker'
import { emptySchedule, scheduleBody, scheduleError, ScheduleFields, type ScheduleFormState } from '@/features/students/schedule-fields'
import { formatDateTime, formatSlot, todayInput } from './slot-form'
import type { LessonClass } from './types'

type SlotPayload = NonNullable<ReturnType<typeof scheduleBody>>

interface ClassFormPayload {
  name: string
  coachName: string
  note: string
  slots?: SlotPayload[]
  studentIds?: string[]
}

export function ClassesScreen() {
  const { success: notifySuccess, error: notifyError } = useToast()
  const { data, isLoading, mutate } = useApi<{ classes: LessonClass[] }>('/api/classes', { dedupingInterval: 60_000 })
  const { registerRefresh } = usePageRefresh()
  const [formOpen, setFormOpen] = useState(false)
  const [editClass, setEditClass] = useState<LessonClass | null>(null)
  const [endTarget, setEndTarget] = useState<LessonClass | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<LessonClass | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    return registerRefresh(() => void mutate())
  }, [registerRefresh, mutate])

  const classes = data?.data?.classes ?? []
  const error = data && !data.success ? (data.error ?? '') : ''

  const openCreate = () => {
    setEditClass(null)
    setFormOpen(true)
  }
  const openEdit = (item: LessonClass) => {
    setEditClass(item)
    setFormOpen(true)
  }

  async function submitForm(payload: ClassFormPayload) {
    setSubmitting(true)
    try {
      const result = editClass
        ? await apiJson(`/api/classes/${editClass.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: payload.name, coachName: payload.coachName, note: payload.note }) })
        : await apiJson('/api/classes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (!result.success) {
        notifyError(result.error || 'Không lưu được lớp học')
        return false
      }
      notifySuccess(editClass ? 'Đã cập nhật lớp học' : 'Đã tạo lớp học')
      setFormOpen(false)
      await mutate()
      return true
    } catch {
      notifyError('Lỗi kết nối máy chủ')
      return false
    } finally {
      setSubmitting(false)
    }
  }

  async function endClass() {
    if (!endTarget) return
    setSubmitting(true)
    try {
      const result = await apiJson(`/api/classes/${endTarget.id}/end`, { method: 'POST' })
      if (!result.success) {
        notifyError(result.error || 'Không kết thúc được lớp')
        return
      }
      notifySuccess('Đã kết thúc lớp và huỷ các buổi tương lai')
      setEndTarget(null)
      await mutate()
    } catch {
      notifyError('Lỗi kết nối máy chủ')
    } finally {
      setSubmitting(false)
    }
  }

  async function deleteClass() {
    if (!deleteTarget) return
    setSubmitting(true)
    try {
      const result = await apiJson(`/api/classes/${deleteTarget.id}`, { method: 'DELETE' })
      if (!result.success) {
        notifyError(result.error || 'Không xoá được lớp')
        return
      }
      notifySuccess('Đã xoá lớp học')
      setDeleteTarget(null)
      await mutate()
    } catch {
      notifyError('Lỗi kết nối máy chủ')
    } finally {
      setSubmitting(false)
    }
  }

  const columns: Column<LessonClass>[] = useMemo(() => [
    {
      key: 'name',
      label: 'Lớp',
      cellClassName: 'px-4 py-3 font-medium text-zinc-950 dark:text-white',
      render: item => (
        <div className="flex items-center gap-2">
          <Link href={`/classes/${item.id}`} className="text-blue-700 hover:underline dark:text-blue-300">{item.name}</Link>
          {!item.isActive && <Badge variant="default" size="sm">Đã kết thúc</Badge>}
        </div>
      ),
    },
    {
      key: 'coachName',
      label: 'Huấn luyện viên',
      cellClassName: 'px-4 py-3 text-sm text-zinc-600 dark:text-zinc-300',
      render: item => item.coachName || '—',
    },
    {
      key: 'slots',
      label: 'Lịch lặp',
      cellClassName: 'px-4 py-3 text-xs text-zinc-600 dark:text-zinc-300',
      render: item => item.slots.length ? item.slots.map(slot => formatSlot(slot)).join(' • ') : '—',
    },
    {
      key: 'studentCount',
      label: 'Học viên',
      cellClassName: 'px-4 py-3 text-sm tabular-nums text-zinc-950 dark:text-white',
      render: item => item.studentCount,
    },
    {
      key: 'nextLessonAt',
      label: 'Buổi tới',
      cellClassName: 'px-4 py-3 text-sm text-zinc-600 dark:text-zinc-300',
      render: item => item.nextLessonAt ? formatDateTime(item.nextLessonAt) : '—',
    },
    {
      label: 'Thao tác',
      cellClassName: 'px-4 py-3',
      render: item => (
        <div className="flex gap-1.5">
          <Button variant="secondary" size="sm" icon={Edit3} disabled={submitting} onClick={() => openEdit(item)} title="Sửa thông tin lớp" />
          {item.isActive && <Button variant="outline-danger" size="sm" icon={StopCircle} disabled={submitting} onClick={() => setEndTarget(item)} title="Kết thúc lớp" />}
          <Button variant="outline-danger" size="sm" icon={Trash2} disabled={submitting} onClick={() => setDeleteTarget(item)} title="Xoá lớp thêm nhầm" />
        </div>
      ),
    },
  ], [submitting])

  const cardColumns: CardColumn<LessonClass>[] = useMemo(() => [
    {
      key: 'name',
      label: 'Lớp',
      render: item => (
        <span className="flex items-center gap-2 text-base font-semibold text-zinc-950 dark:text-white">
          <Link href={`/classes/${item.id}`} className="text-blue-700 hover:underline dark:text-blue-300">{item.name}</Link>
          {!item.isActive && <Badge variant="default" size="sm">Đã kết thúc</Badge>}
        </span>
      ),
    },
    { key: 'coachName', label: 'Huấn luyện viên', render: item => item.coachName || '—' },
    { key: 'slots', label: 'Lịch lặp', render: item => item.slots.length ? item.slots.map(slot => formatSlot(slot)).join(' • ') : '—' },
    { key: 'studentCount', label: 'Học viên', render: item => <span className="font-semibold tabular-nums text-zinc-950 dark:text-white">{item.studentCount}</span> },
    { key: 'nextLessonAt', label: 'Buổi tới', render: item => item.nextLessonAt ? formatDateTime(item.nextLessonAt) : '—' },
    {
      label: '',
      render: item => (
        <div className="flex gap-1.5">
          <Button variant="secondary" size="sm" icon={Edit3} disabled={submitting} onClick={() => openEdit(item)} title="Sửa thông tin lớp" />
          {item.isActive && <Button variant="outline-danger" size="sm" icon={StopCircle} disabled={submitting} onClick={() => setEndTarget(item)} title="Kết thúc lớp" />}
          <Button variant="outline-danger" size="sm" icon={Trash2} disabled={submitting} onClick={() => setDeleteTarget(item)} title="Xoá lớp thêm nhầm" />
        </div>
      ),
    },
  ], [submitting])

  if (isLoading) {
    return <AppSkeleton />
  }

  return (
    <div className="min-h-full bg-zinc-50 px-4 py-4 dark:bg-zinc-950 md:px-6 md:py-6">
      <div className="mx-auto max-w-content space-y-4">
        <header className="hidden items-center justify-between gap-3 md:flex">
          <h1 className="flex items-center gap-2 text-2xl font-bold text-zinc-950 dark:text-white">
            <School size={24} className="text-amber-500" />
            Lớp học
          </h1>
          <Button variant="primary" size="sm" icon={Plus} onClick={openCreate}>Thêm lớp</Button>
        </header>

        <div className="md:hidden">
          <Button variant="primary" size="md" icon={Plus} fullWidth onClick={openCreate}>Thêm lớp</Button>
        </div>

        {error && <NoticeCard tone="danger" title="Không tải được danh sách lớp" description={error} action={<Button variant="secondary" size="sm" onClick={() => void mutate()}>Thử lại</Button>} />}

        {!error && <div className="md:hidden">
          <SortableCardList
            columns={cardColumns}
            data={classes}
            keyExtractor={item => item.id}
            search={{ placeholder: 'Tìm tên lớp hoặc huấn luyện viên', getText: item => `${item.name} ${item.coachName ?? ''}` }}
            filters={[
              { key: 'active', label: 'Đang hoạt động', matches: item => item.isActive },
              { key: 'ended', label: 'Đã kết thúc', matches: item => !item.isActive },
            ]}
            sortableKeys={['name', 'studentCount']}
            defaultSortKey="name"
            emptyIcon={School}
            emptyMessage="Chưa có lớp học"
            emptyDescription="Tạo lớp để quản lý lịch học và sổ học viên riêng cho từng lớp."
          />
        </div>}

        {!error && <div className="hidden md:block">
          <SortableTable
            columns={columns}
            data={classes}
            keyExtractor={item => item.id}
            search={{ placeholder: 'Tìm tên lớp hoặc huấn luyện viên', getText: item => `${item.name} ${item.coachName ?? ''}` }}
            sortableKeys={['name', 'studentCount']}
            defaultSortKey="name"
            emptyIcon={School}
            emptyMessage="Chưa có lớp học"
            emptyDescription="Tạo lớp để quản lý lịch học và sổ học viên riêng cho từng lớp."
          />
        </div>}
      </div>

      {formOpen && <ClassFormModal
        key={editClass?.id ?? 'new'}
        lessonClass={editClass}
        submitting={submitting}
        onClose={() => setFormOpen(false)}
        onSubmit={submitForm}
      />}

      <ConfirmDialog
        open={!!endTarget}
        onClose={() => setEndTarget(null)}
        title="Kết thúc lớp học?"
        description={endTarget ? `Lớp "${endTarget.name}" sẽ chuyển sang trạng thái đã kết thúc và các buổi chưa diễn ra bị huỷ. Lịch sử được giữ lại.` : undefined}
        confirmLabel="Kết thúc lớp"
        submitting={submitting}
        onConfirm={endClass}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Xoá lớp học?"
        description={deleteTarget ? `Chỉ xoá được lớp "${deleteTarget.name}" khi chưa có điểm danh hoặc ghi chú. Nếu lớp đã hoạt động, hãy kết thúc lớp để giữ lại lịch sử học viên.` : undefined}
        confirmLabel="Xoá lớp"
        submitting={submitting}
        onConfirm={deleteClass}
      />
    </div>
  )
}

function ClassFormModal({ lessonClass, submitting, onClose, onSubmit }: {
  lessonClass: LessonClass | null
  submitting: boolean
  onClose: () => void
  onSubmit: (payload: ClassFormPayload) => Promise<boolean>
}) {
  const [name, setName] = useState(lessonClass?.name ?? '')
  const [coachName, setCoachName] = useState(lessonClass?.coachName ?? '')
  const [note, setNote] = useState(lessonClass?.note ?? '')
  const [withSlot, setWithSlot] = useState(!lessonClass)
  const [slot, setSlot] = useState<ScheduleFormState>(() => emptySchedule(todayInput()))
  const [studentIds, setStudentIds] = useState<string[]>([])

  const slotPayload = scheduleBody(slot)
  const slotError = scheduleError(slot)
  const invalidSlot = !lessonClass && withSlot && !slotPayload

  return <Modal
    open
    onClose={onClose}
    title={lessonClass ? 'Sửa thông tin lớp' : 'Thêm lớp học'}
    size="lg"
    footer={
      <Button
        variant="inverse"
        size="lg"
        fullWidth
        disabled={submitting || !name.trim() || invalidSlot}
        onClick={() => void onSubmit({
          name: name.trim(),
          coachName: coachName.trim(),
          note: note.trim(),
          ...(lessonClass ? {} : { slots: withSlot && slotPayload ? [slotPayload] : [], studentIds }),
        })}
      >
        {submitting ? 'Đang lưu...' : lessonClass ? 'Cập nhật lớp' : 'Tạo lớp'}
      </Button>
    }
  >
    <div className="space-y-4">
      <div><Label htmlFor="class-name" required>Tên lớp</Label><Input autoFocus id="class-name" maxLength={150} value={name} onChange={event => setName(event.target.value)} placeholder="VD: Lớp cung cơ bản" /></div>
      <div><Label htmlFor="class-coach">Huấn luyện viên</Label><Input id="class-coach" maxLength={100} value={coachName} onChange={event => setCoachName(event.target.value)} placeholder="Tên huấn luyện viên" /></div>
      <div><Label htmlFor="class-note">Ghi chú</Label><Textarea id="class-note" rows={3} maxLength={2000} value={note} onChange={event => setNote(event.target.value)} placeholder="Trình độ, địa điểm, lưu ý của lớp" /></div>

      {!lessonClass && <>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={withSlot} onChange={event => setWithSlot(event.target.checked)} />Đặt lịch lặp ngay</label>
        {withSlot && <div className="space-y-4 rounded-lg bg-zinc-50 p-3 dark:bg-zinc-900">
          <ScheduleFields idPrefix="class-slot" form={slot} onChange={setSlot} />
          {slotError && <p className="text-sm text-red-600 dark:text-red-400">{slotError}</p>}
        </div>}
        <StudentPicker value={studentIds} onChange={setStudentIds} unassignedOnly />
      </>}

      {lessonClass && <p className="text-xs text-zinc-500 dark:text-zinc-400">Lịch lặp và sổ học viên quản lý ở trang chi tiết lớp.</p>}
    </div>
  </Modal>
}
