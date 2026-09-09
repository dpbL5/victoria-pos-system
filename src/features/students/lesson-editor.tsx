'use client'
import { useApi } from '@/hooks/use-api'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input, Label, Select, Textarea } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useToast } from '@/components/ui/toast'
import { apiJson } from '@/lib/api'
import { StudentPicker } from './student-picker'
import type { Lesson } from './types'

export const localTime = (iso: string) => new Date(Date.parse(iso) + 7 * 3600000).toISOString().slice(0, 16)
export const lockedLesson = (lesson: Lesson) => lesson.status !== 'SCHEDULED' || lesson.students.some(s => s.status !== 'SCHEDULED' || s.packageId)
const weekday = (value: string) => new Date(`${value.slice(0, 10)}T00:00:00Z`).getUTCDay()
const DAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']

export function LessonEditor({ lesson, start, end, studentId, onClose, onSaved }: {
  lesson?: Lesson; start: string; end: string; studentId?: string; onClose: () => void; onSaved: () => void
}) {
  const toast = useToast()
  const [title, setTitle] = useState(lesson?.title ?? '')
  const [coachName, setCoachName] = useState(lesson?.coachName ?? '')
  const [startDay, setStartDay] = useState(localTime(start).slice(0, 10))
  const [startTime, setStartTime] = useState(localTime(start).slice(11))
  const [endTime, setEndTime] = useState(localTime(end).slice(11))
  const startsAt = `${startDay}T${startTime}`
  const endsAt = `${startDay}T${endTime}`
  const [studentIds, setStudentIds] = useState(lesson?.students.map(s => s.studentId) ?? (studentId ? [studentId] : []))
  const [note, setNote] = useState(lesson?.note ?? '')
  const [shareNote, setShareNote] = useState(lesson?.shareNote ?? false)
  const [repeat, setRepeat] = useState(false)
  const [scope, setScope] = useState('SINGLE')
  const [days, setDays] = useState(lesson?.series?.daysOfWeek.map(day => day === weekday(localTime(lesson.startsAt)) ? weekday(localTime(start)) : day) ?? [weekday(localTime(start))])
  const [interval, setInterval] = useState(lesson?.series?.intervalWeeks ?? 1)
  const [ending, setEnding] = useState<'NEVER' | 'DATE' | 'COUNT'>(lesson?.series?.endsOn ? 'DATE' : lesson?.series?.occurrenceCount ? 'COUNT' : 'NEVER')
  const [until, setUntil] = useState(lesson?.series?.endsOn ? localTime(lesson.series.endsOn).slice(0, 10) : '')
  const [count, setCount] = useState(lesson?.series?.occurrenceCount ?? 12)
  const [changeRule, setChangeRule] = useState(Boolean(lesson && localTime(start) !== localTime(lesson.startsAt)))
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const locked = lesson ? lockedLesson(lesson) : false
  const close = () => { if (saving) return; if (dirty) setConfirmClose(true); else onClose() }
  const noteChanged = note !== (lesson?.note ?? '') || shareNote !== (lesson?.shareNote ?? false)
  const recurring = repeat || (Boolean(lesson?.seriesId) && scope !== 'SINGLE')

  const { data: preview } = useApi<{ affected: number; locked: number; exceptions: number }>(lesson?.seriesId && scope !== 'SINGLE' ? `/api/series/${lesson.seriesId}?lessonId=${lesson.id}&scope=${scope}` : null)

  async function save(remove = false) {
    if (saving || lesson?.status === 'CANCELLED') return
    if (!remove && recurring && noteChanged) { toast.error('Lưu ghi chú cho riêng buổi này trước khi đổi phạm vi lặp'); return }
    const startDate = new Date(`${startsAt}:00+07:00`)
    const endDate = new Date(`${endsAt}:00+07:00`)
    const durationMin = (endDate.getTime() - startDate.getTime()) / 60000
    if (!remove && (!title.trim() || !studentIds.length || !Number.isFinite(durationMin) || durationMin <= 0 || durationMin > 1440)) { toast.error('Nhập tiêu đề, học viên, ngày học và giờ kết thúc sau giờ bắt đầu trong cùng ngày'); return }
    setSaving(true)
    try {
      let url = lesson ? `/api/lessons/${lesson.id}` : '/api/lessons'
      let payload: Record<string, unknown> = remove ? { version: lesson?.version } : locked ? { version: lesson?.version, note, shareNote } : { title, coachName, startsAt: startDate.toISOString(), durationMin, studentIds, note, shareNote, ...(lesson ? { version: lesson.version } : {}) }
      if (recurring) {
        url = lesson ? `/api/series/${lesson.seriesId}` : '/api/series'
        payload = lesson ? { version: lesson.series!.version, scope, lessonId: lesson.id, ...(!remove ? { title, coachName, durationMin, studentIds } : {}) } : { title, coachName, durationMin, studentIds }
        if (!remove && (!lesson || changeRule)) Object.assign(payload, { startsOn: startsAt.slice(0, 10), startTime: startsAt.slice(11), daysOfWeek: days, intervalWeeks: interval, endsOn: ending === 'DATE' ? until : null, occurrenceCount: ending === 'COUNT' ? count : null })
      }
      const response = await apiJson(url, { method: remove ? 'DELETE' : lesson ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (!response.success) { toast.error(response.error || 'Không lưu được lịch học'); return }
      toast.success(remove ? 'Đã huỷ lịch học' : 'Đã lưu lịch học')
      onSaved()
    } catch { toast.error('Lỗi kết nối. Hãy kiểm tra lại lịch trước khi thử lại') }
    finally { setSaving(false) }
  }

  return <>
    <Modal open onClose={close} title={lesson ? 'Chi tiết buổi học' : 'Thêm buổi học'} variant="fullscreen" size="lg" footer={<div className="flex items-center justify-between gap-3">{lesson && !locked ? <Button variant="outline-danger" disabled={saving} onClick={() => setConfirmDelete(true)}>Huỷ buổi học</Button> : <span />}
      <Button disabled={saving || lesson?.status === 'CANCELLED' || Boolean(recurring && lesson && (!preview?.success || preview.data?.locked))} onClick={() => void save()}>{saving ? 'Đang lưu...' : 'Lưu'}</Button></div>}>
      <form className="space-y-4 [&_input]:placeholder:text-zinc-500 dark:[&_input]:placeholder:text-zinc-400 [&_textarea]:placeholder:text-zinc-500 dark:[&_textarea]:placeholder:text-zinc-400 dark:[&_input]:[color-scheme:dark]" onChange={() => setDirty(true)} onSubmit={e => { e.preventDefault(); void save() }}>
        {lesson && <div className="flex items-center justify-between gap-2 text-sm"><span>Google Calendar: {lesson.syncStatus === 'SYNCED' ? 'Đã đồng bộ' : lesson.syncStatus === 'ERROR' ? 'Đồng bộ lỗi' : lesson.syncStatus === 'PENDING' ? 'Đang chờ đồng bộ' : 'Chưa đồng bộ'}</span><Button type="button" variant="secondary" size="sm" disabled={saving} onClick={async () => { setSaving(true); try { const result = await apiJson(`/api/lessons/${lesson.id}/sync`, { method: 'POST' }); if (result.success) toast.success('Đã đưa buổi học vào hàng đợi'); else toast.error(result.error || 'Không thể đồng bộ') } catch { toast.error('Không kết nối được máy chủ') } finally { setSaving(false) } }}>Đồng bộ lại</Button></div>}
        {locked && <p className="text-sm text-zinc-600 dark:text-zinc-300">{lesson?.status === 'CANCELLED' ? 'Buổi học đã huỷ không thể chỉnh sửa.' : 'Buổi đã điểm danh chỉ cho chỉnh ghi chú.'}</p>}
        <fieldset disabled={locked || saving} className="space-y-4">
          <div><Label htmlFor="lesson-title" required>Tiêu đề</Label><Input autoFocus id="lesson-title" maxLength={150} value={title} onChange={e => setTitle(e.target.value)} placeholder="Ví dụ: Lớp cung cơ bản" /></div>
          <div><Label htmlFor="lesson-coach">Huấn luyện viên</Label><Input id="lesson-coach" value={coachName} onChange={e => setCoachName(e.target.value)} maxLength={100} placeholder="Tên huấn luyện viên" /></div>
          {lesson?.series && <div><Label htmlFor="lesson-scope">Phạm vi thay đổi</Label><Select id="lesson-scope" value={scope} onChange={e => { if (e.target.value !== 'SINGLE' && noteChanged) { toast.error('Hãy lưu ghi chú cho buổi này trước khi đổi phạm vi'); return }; setScope(e.target.value) }}><option value="SINGLE">Buổi này</option><option value="FOLLOWING">Buổi này và các buổi sau</option><option value="ALL">Toàn bộ chuỗi (giữ lịch sử)</option></Select><p className="mt-1 text-xs text-zinc-500">Thay đổi chuỗi giữ các buổi lịch sử; buổi đã điểm danh không được đổi lịch.</p></div>}
          <div className="grid items-end gap-3 sm:grid-cols-2">
            <div><Label htmlFor="lesson-start-day">{recurring ? 'Ngày bắt đầu lặp' : 'Ngày học'}</Label><Input id="lesson-start-day" type="date" required value={startDay} onChange={e => {
              const next = e.target.value
              if (next) {
                setDays(values => [...new Set([...values.filter(day => day !== weekday(startDay)), weekday(next)])])
              }
              setStartDay(next)
              setChangeRule(true)
            }} /></div>
          {!lesson && <label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" checked={repeat} onChange={e => { if (e.target.checked && noteChanged) { toast.error('Ghi chú dành riêng từng buổi. Hãy lưu buổi này hoặc xoá nội dung ghi chú trước khi tạo chuỗi'); return }; if (e.target.checked && startDay) setDays([weekday(startDay)]); setRepeat(e.target.checked) }} />Lặp lại hằng tuần</label>}
          </div>
          {recurring && preview?.data && <p className="text-sm text-zinc-600 dark:text-zinc-300">Phạm vi gồm {preview.data.affected} buổi, {preview.data.locked} buổi đã điểm danh, {preview.data.exceptions} ngoại lệ. {preview.data.locked > 0 && 'Hãy chọn phạm vi không có buổi đã điểm danh.'}</p>}
          {recurring && lesson && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={changeRule} onChange={e => setChangeRule(e.target.checked)} />Thay đổi quy tắc lặp từ buổi đang chọn</label>}
          {recurring && (!lesson || changeRule) && <div className="space-y-3 rounded-lg bg-zinc-50 p-3 dark:bg-zinc-900"><p className="text-sm text-zinc-600 dark:text-zinc-300">{startDay ? `Lặp từ ngày ${startDay.split('-').reverse().join('/')}, lúc ${startTime}. Chọn các thứ học bên dưới.` : 'Chọn ngày bắt đầu để đặt lịch lặp.'}</p><div><Label htmlFor="lesson-interval">Lặp mỗi bao nhiêu tuần</Label><Input id="lesson-interval" type="number" min={1} max={12} value={interval} onChange={e => setInterval(Number(e.target.value))} /></div><div className="flex flex-wrap gap-2">{DAYS.map((day, i) => <button key={day} type="button" aria-pressed={days.includes(i)} className={`min-h-10 min-w-10 rounded-lg border text-sm ${days.includes(i) ? 'border-blue-600 bg-blue-600 text-white' : 'border-zinc-300 dark:border-zinc-700'}`} onClick={() => { setDays(v => v.includes(i) ? v.filter(d => d !== i) : [...v, i]); setDirty(true) }}>{day}</button>)}</div><div><Label htmlFor="lesson-ending">Kết thúc lặp</Label><Select id="lesson-ending" value={ending} onChange={e => setEnding(e.target.value as typeof ending)}><option value="NEVER">Không kết thúc</option><option value="DATE">Vào ngày</option><option value="COUNT">Sau số buổi</option></Select></div>{ending === 'DATE' && <Input aria-label="Ngày kết thúc lặp" type="date" min={startDay} value={until} onChange={e => setUntil(e.target.value)} />}{ending === 'COUNT' && <Input aria-label="Số buổi lặp" type="number" min={1} max={500} value={count} onChange={e => setCount(Number(e.target.value))} />}</div>}
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label htmlFor="lesson-start-time">Giờ bắt đầu (giờ Việt Nam)</Label><Input id="lesson-start-time" type="time" required value={startTime} onChange={e => { setStartTime(e.target.value); setChangeRule(true) }} /></div>
            <div><Label htmlFor="lesson-end-time">Giờ kết thúc (giờ Việt Nam)</Label><Input id="lesson-end-time" type="time" required value={endTime} onChange={e => setEndTime(e.target.value)} /></div>
          </div>
          <StudentPicker value={studentIds} onChange={ids => { setStudentIds(ids); setDirty(true) }} initial={lesson?.students.map(s => s.student)} />
        </fieldset>
        {!recurring && <><div><Label htmlFor="lesson-note">Ghi chú buổi học</Label><Textarea disabled={saving || lesson?.status === 'CANCELLED'} id="lesson-note" value={note} onChange={e => setNote(e.target.value)} maxLength={2000} rows={4} placeholder="Nội dung buổi học, tiến độ và điều cần lưu ý" /></div><label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={saving || lesson?.status === 'CANCELLED'} checked={shareNote} onChange={e => setShareNote(e.target.checked)} />Đồng bộ ghi chú lên Google Calendar</label><p className="text-xs text-zinc-500">Ghi chú riêng từng học viên chỉ lưu trong ứng dụng.</p></>}
        {recurring && <p className="text-sm text-zinc-500">Ghi chú được lưu riêng từng buổi. Mở “Buổi này” để chỉnh ghi chú.</p>}
      </form>
    </Modal>
    <ConfirmDialog open={confirmClose} title="Bỏ thay đổi chưa lưu?" description="Các thay đổi trong biểu mẫu sẽ không được lưu." confirmLabel="Bỏ thay đổi" onClose={() => setConfirmClose(false)} onConfirm={onClose} />
    <ConfirmDialog open={confirmDelete} title="Huỷ lịch học?" description={recurring ? 'Các buổi chưa diễn ra trong phạm vi đã chọn sẽ bị huỷ. Lịch sử được giữ lại.' : 'Buổi học này sẽ bị huỷ và cập nhật lên Google Calendar.'} confirmLabel="Huỷ lịch học" onClose={() => setConfirmDelete(false)} onConfirm={() => void save(true)} submitting={saving} />
  </>
}
