'use client'
import { useApi } from '@/hooks/use-api'
import { useState } from 'react'
import { ClipboardCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Label, Select, Textarea } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useToast } from '@/components/ui/toast'
import { apiJson } from '@/lib/api'
import { AttendanceDialog } from './attendance-dialog'
import { emptySchedule, scheduleBody, scheduleError, scheduleToForm, ScheduleFields, weekdayOf, type ScheduleFormState } from './schedule-fields'
import { StudentPicker } from './student-picker'
import { LessonStudentNotes } from './lesson-notes'
import type { Lesson } from './types'
import type { LessonClass } from '@/features/classes/types'

export const localTime = (iso: string) => new Date(Date.parse(iso) + 7 * 3600000).toISOString().slice(0, 16)
export const lockedLesson = (lesson: Lesson) => lesson.status !== 'SCHEDULED' || lesson.students.some(s => s.status !== 'SCHEDULED' || s.packageId)

export function LessonEditor({ lesson, start, end, studentId, onClose, onSaved, onNotesSaved }: {
  lesson?: Lesson; start: string; end: string; studentId?: string; onClose: () => void; onSaved: () => void; onNotesSaved?: () => void
}) {
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
  const [studentIds, setStudentIds] = useState(lesson?.students.map(s => s.studentId) ?? (studentId ? [studentId] : []))
  const [note, setNote] = useState(lesson?.note ?? '')
  const [shareNote, setShareNote] = useState(lesson?.shareNote ?? false)
  const [repeat, setRepeat] = useState(false)
  const [pickedClassId, setPickedClassId] = useState('')
  const [pickedRoster, setPickedRoster] = useState<{ id: string; fullName: string }[]>([])
  const [pickingClass, setPickingClass] = useState(false)
  const { data: classOptions } = useApi<{ classes: LessonClass[] }>(!lesson ? '/api/classes?status=ACTIVE' : null)
  async function pickClass(nextId: string) {
    setPickedClassId(nextId)
    if (!nextId) return
    setPickingClass(true)
    try {
      const detail = await apiJson<{ name: string; roster: { id: string; fullName: string }[] }>(`/api/classes/${nextId}`)
      if (!detail.success || !detail.data) {
        toast.error(detail.error || 'Không tải được sổ học viên của lớp')
        return
      }
      setPickedRoster(detail.data.roster)
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
  const [attendanceOpen, setAttendanceOpen] = useState(false)
  const locked = lesson ? lockedLesson(lesson) : false
  const close = () => { if (saving) return; if (dirty) setConfirmClose(true); else onClose() }
  const noteChanged = note !== (lesson?.note ?? '') || shareNote !== (lesson?.shareNote ?? false)
  const recurring = repeat || (Boolean(lesson?.seriesId) && scope !== 'SINGLE')
  /** Chỉ hiện/sửa quy tắc lặp khi thực sự đổi quy tắc (buổi đã có chuỗi cần tick xác nhận). */
  const editingRule = recurring && (!lesson || changeRule)
  const ruleError = editingRule ? scheduleError(schedule) : null

  const { data: preview } = useApi<{ affected: number; locked: number; exceptions: number }>(lesson?.seriesId && scope !== 'SINGLE' ? `/api/series/${lesson.seriesId}?lessonId=${lesson.id}&scope=${scope}` : null)

  async function save(remove = false) {
    if (saving || lesson?.status === 'CANCELLED') return
    if (!remove && recurring && noteChanged) { toast.error('Lưu ghi chú cho riêng buổi này trước khi đổi phạm vi lặp'); return }
    const startDate = new Date(`${startsAt}:00+07:00`)
    const endDate = new Date(`${endsAt}:00+07:00`)
    const durationMin = (endDate.getTime() - startDate.getTime()) / 60000
    if (!remove && (!title.trim() || !studentIds.length || !Number.isFinite(durationMin) || durationMin <= 0 || durationMin > 1440)) { toast.error('Nhập tiêu đề, học viên, ngày học và giờ kết thúc sau giờ bắt đầu trong cùng ngày'); return }
    if (!remove && ruleError) { toast.error(ruleError); return }
    setSaving(true)
    try {
      let url = lesson ? `/api/lessons/${lesson.id}` : '/api/lessons'
      let payload: Record<string, unknown> = remove ? { version: lesson?.version } : locked ? { version: lesson?.version, note, shareNote } : { title, coachName, startsAt: startDate.toISOString(), durationMin, studentIds, note, shareNote, ...(lesson ? { version: lesson.version } : pickedClassId ? { classId: pickedClassId } : {}) }
      if (recurring) {
        url = lesson ? `/api/series/${lesson.seriesId}` : '/api/series'
        payload = lesson ? { version: lesson.series!.version, scope, lessonId: lesson.id, ...(!remove ? { title, coachName, durationMin, studentIds } : {}) } : { title, coachName, durationMin, studentIds, ...(pickedClassId ? { classId: pickedClassId } : {}) }
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
    <Modal open onClose={close} title={lesson ? 'Chi tiết buổi học' : 'Thêm buổi học'} variant="fullscreen" size="lg" footer={<div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        {lesson && !locked ? <Button variant="outline-danger" disabled={saving} onClick={() => setConfirmDelete(true)}>Huỷ buổi học</Button> : null}
        {lesson && lesson.status !== 'CANCELLED' && <Button type="button" variant="secondary" icon={ClipboardCheck} disabled={saving} onClick={() => setAttendanceOpen(true)}>Điểm danh</Button>}
      </div>
      <Button disabled={saving || lesson?.status === 'CANCELLED' || Boolean(recurring && lesson && (!preview?.success || preview.data?.locked))} onClick={() => void save()}>{saving ? 'Đang lưu...' : 'Lưu'}</Button></div>}>
      <form className="space-y-4 [&_input]:placeholder:text-zinc-500 dark:[&_input]:placeholder:text-zinc-400 [&_textarea]:placeholder:text-zinc-500 dark:[&_textarea]:placeholder:text-zinc-400 dark:[&_input]:[color-scheme:dark]" onChange={() => setDirty(true)} onSubmit={e => { e.preventDefault(); void save() }}>
        {lesson && <div className="flex items-center justify-between gap-2 text-sm"><span>Google Calendar: {lesson.syncStatus === 'SYNCED' ? 'Đã đồng bộ' : lesson.syncStatus === 'ERROR' ? 'Đồng bộ lỗi' : lesson.syncStatus === 'PENDING' ? 'Đang chờ đồng bộ' : 'Chưa đồng bộ'}</span><Button type="button" variant="secondary" size="sm" disabled={saving} onClick={async () => { setSaving(true); try { const result = await apiJson<{ queued: boolean; processed: number; syncError?: string }>(`/api/lessons/${lesson.id}/sync`, { method: 'POST' }); if (!result.success) toast.error(result.error || 'Không thể đồng bộ'); else if (result.data?.syncError) toast.error(result.data.syncError); else toast.success(result.data?.processed ? 'Đã đồng bộ buổi học lên Google Calendar' : 'Buổi học đã đồng bộ') } catch { toast.error('Không kết nối được máy chủ') } finally { setSaving(false) } }}>Đồng bộ lại</Button></div>}
        {locked && <p className="text-sm text-zinc-600 dark:text-zinc-300">{lesson?.status === 'CANCELLED' ? 'Buổi học đã huỷ không thể chỉnh sửa.' : 'Buổi đã điểm danh chỉ cho chỉnh ghi chú.'}</p>}
        <fieldset disabled={locked || saving} className="space-y-4">
          <div><Label htmlFor="lesson-title" required>Tiêu đề</Label><Input autoFocus id="lesson-title" maxLength={150} value={title} onChange={e => setTitle(e.target.value)} placeholder="Ví dụ: Lớp cung cơ bản" /></div>
          <div><Label htmlFor="lesson-coach">Huấn luyện viên</Label><Input id="lesson-coach" value={coachName} onChange={e => setCoachName(e.target.value)} maxLength={100} placeholder="Tên huấn luyện viên" /></div>
          {lesson?.series && <div><Label htmlFor="lesson-scope">Phạm vi thay đổi</Label><Select id="lesson-scope" value={scope} onChange={e => { if (e.target.value !== 'SINGLE' && noteChanged) { toast.error('Hãy lưu ghi chú cho buổi này trước khi đổi phạm vi'); return }; setScope(e.target.value) }}><option value="SINGLE">Buổi này</option><option value="FOLLOWING">Buổi này và các buổi sau</option><option value="ALL">Toàn bộ chuỗi (giữ lịch sử)</option></Select><p className="mt-1 text-xs text-zinc-500">Thay đổi chuỗi giữ các buổi lịch sử; buổi đã điểm danh không được đổi lịch.</p></div>}
          {(!lesson || recurring) && <div className="grid items-end gap-3 sm:grid-cols-2">
            <div className="text-sm text-zinc-600 dark:text-zinc-300">{recurring && preview?.data ? `Phạm vi gồm ${preview.data.affected} buổi, ${preview.data.locked} buổi đã điểm danh, ${preview.data.exceptions} ngoại lệ.` : 'Buổi lẻ trong lịch; bật lặp để sinh chuỗi hằng tuần.'}{recurring && preview?.data?.locked ? ' Hãy chọn phạm vi không có buổi đã điểm danh.' : ''}</div>
            {!lesson && <label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" checked={repeat} onChange={e => { if (e.target.checked && noteChanged) { toast.error('Ghi chú dành riêng từng buổi. Hãy lưu buổi này hoặc xoá nội dung ghi chú trước khi tạo chuỗi'); return }; if (e.target.checked && startDay) setSchedule(value => ({ ...value, days: [weekdayOf(startDay)] })); setRepeat(e.target.checked) }} />Lặp lại hằng tuần</label>}
          </div>}
          {recurring && lesson && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={changeRule} onChange={e => setChangeRule(e.target.checked)} />Thay đổi quy tắc lặp từ buổi đang chọn</label>}
          <div className={editingRule ? 'space-y-3 rounded-lg bg-zinc-50 p-3 dark:bg-zinc-900' : ''}>
            {editingRule && <p className="text-sm text-zinc-600 dark:text-zinc-300">{startDay ? `Lặp từ ngày ${startDay.split('-').reverse().join('/')}, lúc ${startTime}. Chọn các thứ học bên dưới.` : 'Chọn ngày bắt đầu để đặt lịch lặp.'}</p>}
            <ScheduleFields
              idPrefix="lesson-schedule"
              form={schedule}
              showRepeat={editingRule}
              startsOnLabel={recurring ? 'Ngày bắt đầu lặp' : 'Ngày học'}
              onChange={value => { setSchedule(value); setDirty(true); if (lesson) setChangeRule(true) }}
            />
            {ruleError && <p className="text-sm text-red-600 dark:text-red-400">{ruleError}</p>}
          </div>
          {!lesson && <div>
            <Label htmlFor="lesson-class">Lớp (tuỳ chọn)</Label>
            <Select id="lesson-class" value={pickedClassId} disabled={pickingClass} onChange={e => void pickClass(e.target.value)}>
              <option value="">Buổi lẻ không thuộc lớp</option>
              {classOptions?.data?.classes?.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </Select>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Dùng cho chuyển lịch hoặc học bù: chọn lớp để tự điền sổ học viên và tiêu đề; buổi vẫn nằm trong lịch của lớp.</p>
          </div>}
          <StudentPicker key={pickedClassId || 'free'} value={studentIds} onChange={ids => { setStudentIds(ids); setDirty(true) }} initial={lesson?.students.map(s => s.student) ?? (pickedClassId ? pickedRoster : [])} />
        </fieldset>
        {!recurring && <><div><Label htmlFor="lesson-note">Ghi chú buổi học</Label><Textarea disabled={saving || lesson?.status === 'CANCELLED'} id="lesson-note" value={note} onChange={e => setNote(e.target.value)} maxLength={2000} rows={4} placeholder="Nội dung buổi học, tiến độ và điều cần lưu ý" /></div><label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={saving || lesson?.status === 'CANCELLED'} checked={shareNote} onChange={e => setShareNote(e.target.checked)} />Đồng bộ ghi chú lên Google Calendar</label><p className="text-xs text-zinc-500">Ghi chú riêng từng học viên chỉ lưu trong ứng dụng.</p></>}
        {recurring && <p className="text-sm text-zinc-500">Ghi chú được lưu riêng từng buổi. Mở “Buổi này” để chỉnh ghi chú.</p>}
      </form>
      {lesson && !recurring && lesson.status !== 'CANCELLED' && lesson.students.length > 0 && (
        <LessonStudentNotes
          lessonId={lesson.id}
          students={lesson.students.map(ls => ({ studentId: ls.studentId, fullName: ls.student.fullName, note: ls.note }))}
          onSaved={onNotesSaved}
        />
      )}
    </Modal>
    <ConfirmDialog open={confirmClose} title="Bỏ thay đổi chưa lưu?" description="Các thay đổi trong biểu mẫu sẽ không được lưu." confirmLabel="Bỏ thay đổi" onClose={() => setConfirmClose(false)} onConfirm={onClose} />
    <ConfirmDialog open={confirmDelete} title={recurring ? 'Huỷ chuỗi lịch học?' : 'Huỷ lịch học?'} description={recurring ? 'Các buổi chưa diễn ra trong phạm vi đã chọn sẽ bị huỷ. Lịch sử được giữ lại.' : 'Buổi học này sẽ bị huỷ và cập nhật lên Google Calendar.'} confirmLabel={recurring ? 'Huỷ theo chuỗi' : 'Huỷ lịch học'} onClose={() => setConfirmDelete(false)} onConfirm={() => void save(true)} submitting={saving} />
    {attendanceOpen && lesson && <AttendanceDialog lesson={lesson} onClose={() => setAttendanceOpen(false)} onSaved={onSaved} />}
  </>
}
