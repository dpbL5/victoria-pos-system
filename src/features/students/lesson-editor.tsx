'use client'
import { useApi } from '@/hooks/use-api'
import { useState } from 'react'
import { Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input, Label, Select, Textarea } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useToast } from '@/components/ui/toast'
import { apiJson } from '@/lib/api'
import { AttendanceDialog } from './attendance-dialog'
import { emptySchedule, scheduleBody, scheduleError, scheduleToForm, ScheduleFields, weekdayOf, type ScheduleFormState } from './schedule-fields'
import type { Lesson } from './types'
import type { LessonClass } from '@/features/classes/types'

export const localTime = (iso: string) => new Date(Date.parse(iso) + 7 * 3600000).toISOString().slice(0, 16)
export const lockedLesson = (lesson: Lesson) => lesson.status !== 'SCHEDULED' || lesson.students.some(s => s.status !== 'SCHEDULED')

export function LessonEditor({ lesson: initialLesson, start, end, onClose, onSaved, onNotesSaved }: {
  lesson?: Lesson; start: string; end: string; onClose: () => void; onSaved: () => void; onNotesSaved?: () => void
}) {
  const [lesson, setLesson] = useState(initialLesson)
  const [editingDetails, setEditingDetails] = useState(!initialLesson)
  const toast = useToast()
  const [title, setTitle] = useState(lesson?.title ?? '')
  const [coachName, setCoachName] = useState(lesson?.coachName ?? '')
  const [schedule, setSchedule] = useState<ScheduleFormState>(() => {
    const startDay = localTime(start).slice(0, 10)
    if (!lesson?.series) return { ...emptySchedule(startDay), startTime: localTime(start).slice(11), endTime: localTime(end).slice(11) }
    const base = scheduleToForm(lesson.series)
    const movedFrom = weekdayOf(localTime(lesson.startsAt).slice(0, 10))
    const movedTo = weekdayOf(startDay)
    return { ...base, days: base.days.map(day => day === movedFrom ? movedTo : day), startTime: localTime(start).slice(11), endTime: localTime(end).slice(11), startsOn: startDay }
  })
  const { startsOn: startDay, startTime, endTime } = schedule
  const startsAt = `${startDay}T${startTime}`
  const endsAt = `${startDay}T${endTime}`
  const [studentIds, setStudentIds] = useState(lesson?.students.map(s => s.studentId) ?? [])
  const [note, setNote] = useState(lesson?.note ?? '')
  const [pickedClassId, setPickedClassId] = useState('')
  const [pickingClass, setPickingClass] = useState(false)
  const { data: classOptions } = useApi<{ classes: LessonClass[] }>(!lesson ? '/api/classes?status=ACTIVE' : null)
  async function pickClass(nextId: string) {
    setPickedClassId(nextId)
    if (!nextId) return
    setStudentIds([])
    setPickingClass(true)
    try {
      const detail = await apiJson<{ name: string; roster: { id: string; fullName: string }[] }>(`/api/classes/${nextId}`)
      if (!detail.success || !detail.data) {
        toast.error(detail.error || 'Không tải được sổ học viên của lớp')
        return
      }
      setStudentIds(detail.data.roster.map(member => member.id))
      setTitle(current => current.trim() ? current : detail.data!.name)
      setDirty(true)
    } catch {
      toast.error('Lỗi kết nối máy chủ')
    } finally {
      setPickingClass(false)
    }
  }
  const [scope, setScope] = useState('SINGLE')
  const [changeRule, setChangeRule] = useState(Boolean(lesson && localTime(start) !== localTime(lesson.startsAt)))
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const locked = lesson ? lockedLesson(lesson) : false
  const close = () => { if (saving) return; if (dirty) setConfirmClose(true); else onClose() }
  const noteChanged = note !== (lesson?.note ?? '')
  const recurring = Boolean(lesson?.seriesId) && scope !== 'SINGLE'
  const showAttendance = Boolean(lesson && !recurring && lesson.status !== 'CANCELLED' && lesson.students.length)
  /** Chỉ hiện/sửa quy tắc lặp khi thực sự đổi quy tắc (buổi đã có chuỗi cần tick xác nhận). */
  const editingRule = recurring && (!lesson || changeRule)
  const ruleError = editingRule ? scheduleError(schedule) : null

  const { data: preview } = useApi<{ affected: number; locked: number; exceptions: number }>(lesson?.seriesId && scope !== 'SINGLE' ? `/api/series/${lesson.seriesId}?lessonId=${lesson.id}&scope=${scope}` : null)

  async function save(remove = false) {
    if (saving || lesson?.status === 'CANCELLED') return
    if (!remove && !lesson && (!pickedClassId || pickingClass || !studentIds.length)) {
      toast.error(!pickedClassId ? 'Chọn lớp học' : 'Lớp chưa có học viên')
      return
    }
    if (!remove && recurring && noteChanged) { toast.error('Lưu ghi chú cho riêng buổi này trước khi đổi phạm vi lặp'); return }
    const startDate = new Date(`${startsAt}:00+07:00`)
    const endDate = new Date(`${endsAt}:00+07:00`)
    const durationMin = (endDate.getTime() - startDate.getTime()) / 60000
    if (!remove && (!title.trim() || !studentIds.length || !Number.isFinite(durationMin) || durationMin <= 0 || durationMin > 1440)) { toast.error('Nhập tiêu đề, học viên, ngày học và giờ kết thúc sau giờ bắt đầu trong cùng ngày'); return }
    if (!remove && ruleError) { toast.error(ruleError); return }
    setSaving(true)
    try {
      let url = lesson ? `/api/lessons/${lesson.id}` : '/api/lessons'
      let payload: Record<string, unknown> = remove ? { version: lesson?.version } : locked ? { version: lesson?.version, note } : { title, coachName, startsAt: startDate.toISOString(), durationMin, studentIds, note, ...(lesson ? { version: lesson.version } : { classId: pickedClassId }) }
      if (recurring) {
        url = `/api/series/${lesson!.seriesId}`
        payload = { version: lesson!.series!.version, scope, lessonId: lesson!.id, ...(!remove ? { title, coachName, durationMin, studentIds } : {}) }
        if (!remove && editingRule) {
          const rule = scheduleBody(schedule)!
          Object.assign(payload, { startsOn: rule.startsOn, startTime: rule.startTime, daysOfWeek: rule.daysOfWeek, intervalWeeks: rule.intervalWeeks, endsOn: rule.endsOn, occurrenceCount: rule.occurrenceCount })
        }
      }
      const response = await apiJson(url, { method: remove ? 'DELETE' : lesson ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (!response.success) { toast.error(response.error || 'Không lưu được lịch học'); return }
      toast.success(remove ? 'Đã huỷ lịch học' : 'Đã lưu lịch học')
      onSaved()
    } catch { toast.error('Lỗi kết nối. Hãy kiểm tra lại lịch trước khi thử lại') }
    finally { setSaving(false) }
  }

  return <>
    <Modal open onClose={close} title={lesson ? 'Chi tiết buổi học' : 'Thêm buổi học'} variant="fullscreen" size="lg" footer={editingDetails ? <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        {lesson && !locked ? <Button variant="red" disabled={saving} onClick={() => setConfirmDelete(true)}>Huỷ buổi học</Button> : null}
      </div>
    <Button variant="contrast" disabled={saving || lesson?.status === 'CANCELLED' || Boolean(!lesson && (!pickedClassId || pickingClass || !studentIds.length)) || Boolean(recurring && lesson && (!preview?.success || preview.data?.locked))} onClick={() => void save()}>{saving ? 'Đang lưu...' : 'Lưu'}</Button></div> : undefined}>
      <div className="space-y-5">
      {lesson && !editingDetails ? (
        <section className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-semibold text-zinc-950 dark:text-white">{lesson.title}</h2>
              {lesson.status === 'CANCELLED' && <Badge variant="danger">Đã huỷ</Badge>}
            </div>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">{localTime(lesson.startsAt).replace('T', ' ')} · {lesson.durationMin} phút</p>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">{lesson.coachName || 'Chưa phân công huấn luyện viên'}</p>
          </div>
            {lesson.status !== 'CANCELLED' && <Button type="button" variant="white" size="sm" icon={Pencil} onClick={() => setEditingDetails(true)}>Sửa thông tin</Button>}
        </section>
      ) : <form className="space-y-4 [&_input]:placeholder:text-zinc-500 dark:[&_input]:placeholder:text-zinc-400 [&_textarea]:placeholder:text-zinc-500 dark:[&_textarea]:placeholder:text-zinc-400 dark:[&_input]:[color-scheme:dark]" onChange={() => setDirty(true)} onSubmit={e => { e.preventDefault(); void save() }}>
        {locked && <p className="text-sm text-zinc-600 dark:text-zinc-300">{lesson?.status === 'CANCELLED' ? 'Buổi học đã huỷ không thể chỉnh sửa.' : 'Buổi đã điểm danh chỉ cho chỉnh ghi chú.'}</p>}
        <fieldset disabled={locked || saving} className="space-y-4">
          {!lesson && <div>
            <Label htmlFor="lesson-class" required>Lớp</Label>
            <Select id="lesson-class" autoFocus value={pickedClassId} disabled={pickingClass} onChange={e => void pickClass(e.target.value)}>
              <option value="">Chọn lớp</option>
              {classOptions?.data?.classes?.map(item => <option key={item.id} value={item.id} disabled={!item.studentCount}>{item.name} ({item.studentCount} học viên)</option>)}
            </Select>
          </div>}
          <div><Label htmlFor="lesson-title" required>Tiêu đề</Label><Input autoFocus={Boolean(lesson)} id="lesson-title" maxLength={150} value={title} onChange={e => setTitle(e.target.value)} placeholder="Ví dụ: Lớp cung cơ bản" /></div>
          <div><Label htmlFor="lesson-coach">Huấn luyện viên</Label><Input id="lesson-coach" value={coachName} onChange={e => setCoachName(e.target.value)} maxLength={100} placeholder="Tên huấn luyện viên" /></div>
          {lesson?.series && <div><Label htmlFor="lesson-scope">Phạm vi thay đổi</Label><Select id="lesson-scope" value={scope} onChange={e => { if (e.target.value !== 'SINGLE' && noteChanged) { toast.error('Hãy lưu ghi chú cho buổi này trước khi đổi phạm vi'); return }; setScope(e.target.value) }}><option value="SINGLE">Buổi này</option><option value="FOLLOWING">Buổi này và các buổi sau</option><option value="ALL">Toàn bộ chuỗi (giữ lịch sử)</option></Select></div>}
          {recurring && lesson && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={changeRule} onChange={e => setChangeRule(e.target.checked)} />Thay đổi quy tắc lặp từ buổi đang chọn</label>}
          <div className={editingRule ? 'space-y-3 rounded-lg bg-zinc-50 p-3 dark:bg-zinc-900' : ''}>
            <ScheduleFields
              idPrefix="lesson-schedule"
              form={schedule}
              showRepeat={editingRule}
              startsOnLabel={recurring ? 'Ngày bắt đầu lặp' : 'Ngày học'}
              onChange={value => { setSchedule(value); setDirty(true); if (lesson) setChangeRule(true) }}
            />
              {ruleError && <p className="text-sm text-danger">{ruleError}</p>}
          </div>
        </fieldset>
        {!recurring && <div><Label htmlFor="lesson-note">Ghi chú buổi học</Label><Textarea disabled={saving || lesson?.status === 'CANCELLED'} id="lesson-note" value={note} onChange={e => setNote(e.target.value)} maxLength={2000} rows={4} placeholder="Nội dung buổi học, tiến độ và điều cần lưu ý" /></div>}
      </form>
      }
      {showAttendance && lesson && (
        <AttendanceDialog
          inline
          lesson={lesson}
          onSaved={() => onNotesSaved?.()}
          onLessonChange={setLesson}
        />
      )}
      </div>
    </Modal>
    <ConfirmDialog open={confirmClose} title="Bỏ thay đổi chưa lưu?" description="Các thay đổi trong biểu mẫu sẽ không được lưu." confirmLabel="Bỏ thay đổi" onClose={() => setConfirmClose(false)} onConfirm={onClose} />
    <ConfirmDialog open={confirmDelete} title={recurring ? 'Huỷ chuỗi lịch học?' : 'Huỷ lịch học?'} description={recurring ? 'Các buổi chưa diễn ra trong phạm vi đã chọn sẽ bị huỷ. Lịch sử được giữ lại.' : 'Buổi học này sẽ bị huỷ và cập nhật lên Google Calendar.'} confirmLabel={recurring ? 'Huỷ theo chuỗi' : 'Huỷ lịch học'} onClose={() => setConfirmDelete(false)} onConfirm={() => void save(true)} submitting={saving} />
  </>
}
