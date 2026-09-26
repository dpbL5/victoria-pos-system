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
import { useToast } from '@/components/ui/toast'
import { useApi } from '@/hooks/use-api'
import { apiJson } from '@/lib/api'
import { usePageRefresh } from '@/components/layout/page-refresh-context'
import { StudentPicker } from '@/features/students/student-picker'
import { emptySchedule, scheduleBody, scheduleError, ScheduleFields, scheduleToForm, type ScheduleFormState } from '@/features/students/schedule-fields'
import { formatDate, formatSlot, todayInput } from './slot-form'
import type { ClassDetail, ClassSlot } from './types'

const TABS = [
  { key: 'info', label: 'Thông tin' },
  { key: 'roster', label: 'Sổ học viên' },
] as const

type TabKey = typeof TABS[number]['key']

export function ClassDetailScreen({ id }: { id: string }) {
  const { success: notifySuccess, error: notifyError } = useToast()
  const router = useRouter()
  const { data, isLoading, mutate } = useApi<ClassDetail>(`/api/classes/${id}`)
  const { registerRefresh } = usePageRefresh()
  const [tab, setTab] = useState<TabKey>('info')
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

  useEffect(() => {
    return registerRefresh(() => void mutate())
  }, [registerRefresh, mutate])


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
      await mutate()
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
      await mutate()
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
      await mutate()
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
      await mutate()
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
      await mutate()
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
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
            {detail.coachName ? `HLV ${detail.coachName} · ` : ''}{detail.studentCount} học viên · {slots.length} lịch lặp
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" icon={CalendarClock} onClick={() => router.push(`/lessons?classId=${id}`)}>Xem lịch</Button>
          <Button variant="secondary" size="sm" icon={Edit3} onClick={() => setInfoOpen(true)}>Sửa thông tin</Button>
          {detail.isActive && <Button variant="outline-danger" size="sm" icon={StopCircle} onClick={() => setEndOpen(true)}>Kết thúc lớp</Button>}
          <Button variant="outline-danger" size="sm" icon={Trash2} onClick={() => setDeleteOpen(true)} title="Xoá lớp thêm nhầm">Xoá lớp</Button>
        </div>
      </header>

      {error && <NoticeCard tone="danger" title="Không tải được lớp học" description={error} />}

      <div className="flex gap-1 rounded-xl bg-surface-secondary p-1 ring-1 ring-border-default">
        {TABS.map(item => (
          <button
            key={item.key}
            type="button"
            aria-pressed={tab === item.key}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium ${tab === item.key ? 'bg-white text-zinc-950 shadow-sm dark:bg-zinc-900 dark:text-white' : 'text-zinc-600 dark:text-zinc-300'}`}
            onClick={() => setTab(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'info' && <div className="space-y-4">
        <section className="rounded-xl bg-white p-4 ring-1 ring-border-default dark:bg-zinc-900">
          <div className="flex items-center justify-between"><h2 className="font-semibold text-zinc-950 dark:text-white">Lịch lặp của lớp</h2>{detail.isActive && <Button variant="secondary" size="sm" icon={Plus} onClick={() => setSlotTarget('new')}>Thêm lịch lặp</Button>}</div>
          <div className="mt-3 space-y-2">
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

        {detail.note && <section className="rounded-xl bg-white p-4 ring-1 ring-border-default dark:bg-zinc-900">
          <h2 className="font-semibold text-zinc-950 dark:text-white">Ghi chú</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-600 dark:text-zinc-300">{detail.note}</p>
        </section>}
      </div>}

      {tab === 'roster' && <section className="space-y-3 rounded-xl bg-white p-4 ring-1 ring-border-default dark:bg-zinc-900">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-zinc-950 dark:text-white">Sổ học viên ({selectedStudents.length})</h2>
          {detail.isActive && <Button variant="primary" size="sm" disabled={submitting || !rosterChanged} onClick={() => void saveRoster()}>{submitting ? 'Đang lưu...' : 'Lưu sổ học viên'}</Button>}
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">Thêm hoặc bớt học viên áp cho mọi lịch lặp của lớp và các buổi chưa điểm danh. Buổi đã điểm danh được giữ nguyên. Mỗi học viên chỉ thuộc một lớp.</p>
        <StudentPicker key={detail.id} value={selectedStudents} disabled={!detail.isActive} onChange={setRosterIds} initial={detail.roster} availableForClassId={detail.id} />
      </section>}
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
