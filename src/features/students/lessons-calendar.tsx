'use client'
import { useCallback, useRef, useState } from 'react'
import Link from 'next/link'
import FullCalendar, { type CalendarRef, type EventDropInfo, type EventResizeDoneInfo } from '@fullcalendar/react'
import dayGrid from '@fullcalendar/react/daygrid'
import timeGrid from '@fullcalendar/react/timegrid'
import list from '@fullcalendar/react/list'
import interaction from '@fullcalendar/react/interaction'
import theme from '@fullcalendar/react/themes/classic'
import vi from '@fullcalendar/react/locales/vi'
import '@fullcalendar/react/skeleton.css'
import '@fullcalendar/react/themes/classic/theme.css'
import '@fullcalendar/react/themes/classic/palette.css'
import './lessons-calendar.css'
import { ChevronLeft, ChevronRight, Plus, Users, CheckCircle2, SlidersHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Label, Select } from '@/components/ui/input'
import { NoticeCard } from '@/components/ui/notice-card'
import { useApi } from '@/hooks/use-api'
import { useToast } from '@/components/ui/toast'
import { apiJson } from '@/lib/api'
import { LessonEditor, localTime, lockedLesson } from './lesson-editor'
import { CalendarConnection } from './calendar-connection'
import { AttendanceDialog } from './attendance-dialog'
import type { Lesson, Student } from './types'

const VIEWS = { timeGridDay: 'Ngày', timeGridWeek: 'Tuần', dayGridMonth: 'Tháng', listWeek: 'Danh sách' }
export default function LessonsCalendar() {
  const [initial] = useState(() => new URLSearchParams(window.location.search))
  const [view, setView] = useState(() => initial.get('view') ?? (window.innerWidth < 768 ? 'timeGridDay' : 'timeGridWeek'))
  const [date, setDate] = useState(() => initial.get('date') ?? localTime(new Date().toISOString()).slice(0, 10))
  const [title, setTitle] = useState('Lịch học')
  const [range, setRange] = useState<{ from: string; to: string } | null>(null)
  const [studentId, setStudentId] = useState(initial.get('studentId') ?? '')
  const [search, setSearch] = useState('')
  const [coach, setCoach] = useState(initial.get('coachName') ?? '')
  const [status, setStatus] = useState(initial.get('status') ?? '')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [editor, setEditor] = useState<{ lesson?: Lesson; start: string; end: string } | null>(null)
  const [attendance, setAttendance] = useState<Lesson | null>(null)
  const [busy, setBusy] = useState(false)
  const ref = useRef<CalendarRef>(null)
  const toast = useToast()
  const params = new URLSearchParams({ from: range?.from ?? '', to: range?.to ?? '', studentId, coachName: coach, status })
  const { data, error, isLoading, mutate } = useApi<{ lessons: Lesson[]; warning?: string }>(range ? `/api/lessons?${params}` : null, { refreshInterval: 30000 })
  const { data: students } = useApi<Student[]>(`/api/students?limit=100&search=${encodeURIComponent(search)}`)
  const lessons = data?.data?.lessons ?? []
  const persist = useCallback((values: Record<string, string>) => {
    const query = new URLSearchParams(window.location.search)
    for (const [key, value] of Object.entries(values)) { if (value) query.set(key, value); else query.delete(key) }
    window.history.replaceState(null, '', `/lessons?${query}`)
  }, [])
  const openNew = (start: string, end?: string) => {
    const actual = start.length === 10 ? `${start}T18:00:00+07:00` : start
    setEditor({ start: actual, end: end ?? new Date(Date.parse(actual) + 3600000).toISOString() })
  }
  async function move(info: EventDropInfo | EventResizeDoneInfo) {
    const lesson = lessons.find(l => l.id === info.event.id)
    if (!lesson || !info.event.start || !info.event.end || busy) { info.revert(); return }
    const start = info.event.start.toISOString()
    const end = info.event.end.toISOString()
    if (lesson.seriesId) { info.revert(); setEditor({ lesson, start, end }); return }
    setBusy(true)
    try {
      const result = await apiJson(`/api/lessons/${lesson.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version: lesson.version, startsAt: start, durationMin: (Date.parse(end) - Date.parse(start)) / 60000 }) })
      if (!result.success) { info.revert(); toast.error(result.error || 'Không đổi được giờ học') }
      else toast.success('Đã đổi lịch học')
      await mutate()
    } catch { info.revert(); toast.error('Không lưu được thay đổi. Hãy tải lại lịch'); await mutate() }
    finally { setBusy(false) }
  }
  return <div className="lessons-calendar min-h-full bg-white p-3 text-zinc-950 dark:bg-zinc-950 dark:text-white md:p-5">
    <header className="mb-4 flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><h1 className="text-xl font-semibold">Lịch học</h1><Link href="/students" className="inline-flex items-center gap-1 text-sm text-blue-700 dark:text-blue-300"><Users size={16} />Học viên</Link></div><div className="flex gap-2"><CalendarConnection /><Button size="sm" icon={Plus} onClick={() => openNew(date)}>Thêm buổi</Button></div></header>
    <div className="mb-4 flex flex-wrap items-center gap-2"><Button variant="secondary" size="sm" onClick={() => ref.current?.getApi().today()}>Hôm nay</Button><Button variant="ghost" size="sm" icon={ChevronLeft} aria-label="Khoảng trước" onClick={() => ref.current?.getApi().prev()} /><Button variant="ghost" size="sm" icon={ChevronRight} aria-label="Khoảng sau" onClick={() => ref.current?.getApi().next()} /><p className="min-w-40 flex-1 text-sm font-medium md:text-lg">{title}</p><Select aria-label="Chế độ xem lịch" className="!w-auto" value={view} onChange={e => { setView(e.target.value); ref.current?.getApi().changeView(e.target.value) }}>{Object.entries(VIEWS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select><Button variant="ghost" icon={SlidersHorizontal} size="sm" aria-label="Bộ lọc lịch" aria-expanded={filtersOpen} className="md:hidden" onClick={() => setFiltersOpen(v => !v)} /></div>
    <div className="flex flex-col gap-4 md:flex-row"><aside className={`${filtersOpen ? 'block' : 'hidden'} space-y-4 md:block md:w-48 md:shrink-0`}>
      <div><Label htmlFor="calendar-date">Đến ngày</Label><Input id="calendar-date" type="date" value={date} onChange={e => { if (e.target.value) ref.current?.getApi().gotoDate(e.target.value) }} /></div>
      <div className="lesson-mini" aria-label="Chọn ngày trong tháng"><FullCalendar key={date.slice(0, 7)} plugins={[theme, dayGrid, interaction]} locale={vi} timeZone="Asia/Ho_Chi_Minh" initialView="dayGridMonth" initialDate={date} headerToolbar={false} height="auto" fixedWeekCount={false} firstDay={1} dayHeaderFormat={{ weekday: 'narrow' }} dayCellClass="lesson-mini-day" dateClick={info => ref.current?.getApi().gotoDate(info.dateStr)} /></div>
      <div><Label htmlFor="calendar-student-search">Tìm học viên</Label><Input id="calendar-student-search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Tên hoặc điện thoại" /><Select aria-label="Lọc học viên" className="mt-2" value={studentId} onChange={e => { setStudentId(e.target.value); persist({ studentId: e.target.value }) }}><option value="">Tất cả học viên</option>{studentId && !students?.data?.some(s => s.id === studentId) && <option value={studentId}>Học viên đang chọn</option>}{students?.data?.map(s => <option key={s.id} value={s.id}>{s.fullName}</option>)}</Select></div>
      <div><Label htmlFor="calendar-coach">Huấn luyện viên</Label><Input id="calendar-coach" value={coach} placeholder="Tìm theo tên" onChange={e => { setCoach(e.target.value); persist({ coachName: e.target.value }) }} /></div>
      <div><Label htmlFor="calendar-status">Trạng thái</Label><Select id="calendar-status" value={status} onChange={e => { setStatus(e.target.value); persist({ status: e.target.value }) }}><option value="">Các buổi chưa huỷ</option><option value="SCHEDULED">Đã xếp lịch</option><option value="COMPLETED">Hoàn thành</option><option value="CANCELLED">Đã huỷ</option></Select></div>
      <p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">Giờ Việt Nam · Kéo chọn để tạo buổi. Bấm buổi học để chỉnh sửa và ghi chú.</p>
    </aside><main className="min-w-0 flex-1">
      {(error || data?.success === false) && <NoticeCard tone="danger" title="Không tải được lịch" description={data?.error ?? 'Kiểm tra kết nối và thử lại'} action={<Button variant="secondary" size="sm" onClick={() => void mutate()}>Thử lại</Button>} />}
      {data?.data?.warning && <NoticeCard tone="warning" title="Lịch chưa được sinh đầy đủ" description={data.data.warning} />}
      <div className="mb-2 flex min-h-5 items-center justify-between text-xs text-zinc-500" aria-live="polite"><span>{isLoading ? 'Đang tải lịch...' : `${lessons.length} buổi trong khoảng đang xem`}</span>{busy && <span>Đang lưu...</span>}</div>
      <FullCalendar ref={ref} plugins={[theme, dayGrid, timeGrid, list, interaction]} locale={vi} timeZone="Asia/Ho_Chi_Minh" initialView={view in VIEWS ? view : 'timeGridWeek'} initialDate={date} headerToolbar={false} firstDay={1} height="max(520px, calc(100dvh - 210px))" nowIndicator allDaySlot={false} slotMinTime="00:00:00" slotMaxTime="24:00:00" scrollTime="08:00:00" slotDuration="00:30:00" snapDuration="00:15:00" selectable={!busy} selectMirror editable={!busy} eventDurationEditable eventResizableFromStart dayMaxEvents={3} slotLaneClass="lesson-slot" eventClass={info => info.event.extendedProps.lesson?.status === 'CANCELLED' ? 'lesson-cancelled' : ''} longPressDelay={500} eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
        datesSet={info => { const next = { from: info.start.toISOString(), to: info.end.toISOString() }; setRange(prev => prev?.from === next.from && prev.to === next.to ? prev : next); setTitle(info.view.title); const current = localTime(info.view.calendar.getDate().toISOString()).slice(0, 10); setDate(current); setView(info.view.type); persist({ date: current, view: info.view.type }) }}
        dateClick={info => openNew(info.dateStr)} select={info => { if (!info.allDay) openNew(info.start.toISOString(), info.end.toISOString()) }}
        events={lessons.map(l => ({ id: l.id, title: l.title, start: l.startsAt, end: new Date(Date.parse(l.startsAt) + l.durationMin * 60000).toISOString(), editable: !lockedLesson(l), classNames: l.status === 'CANCELLED' ? ['lesson-cancelled'] : [], extendedProps: { lesson: l } }))}
        eventClick={info => { const lesson = lessons.find(l => l.id === info.event.id); if (lesson) setEditor({ lesson, start: lesson.startsAt, end: new Date(Date.parse(lesson.startsAt) + lesson.durationMin * 60000).toISOString() }) }} eventDrop={info => void move(info)} eventResize={info => void move(info)}
        eventContent={info => { const lesson = info.event.extendedProps.lesson as Lesson | undefined; if (!lesson) return <div className="px-1">{info.timeText}</div>; return <div className="min-w-0 px-1"><p className="truncate font-medium">{info.timeText} {lesson.title}</p><p className="truncate text-xs">{lesson.students.map(s => s.student.fullName).join(', ')}</p>{lesson.syncStatus === 'ERROR' && <span className="text-xs">Đồng bộ lỗi</span>}</div> }}
        eventDidMount={info => { const lesson = info.event.extendedProps.lesson as Lesson | undefined; if (!lesson || info.isMirror) return; info.el.setAttribute('data-lesson-event', lesson.id); info.el.setAttribute('tabindex', '0'); info.el.setAttribute('role', 'button'); info.el.setAttribute('aria-label', `${lesson.title}, ${localTime(lesson.startsAt).replace('T', ' ')}, mở để chỉnh sửa`); info.el.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); info.el.click() } } }}
      />
      {lessons.length > 0 && <details className="mt-4 border-t border-zinc-200 pt-3 dark:border-zinc-800"><summary className="cursor-pointer text-sm font-medium">Điểm danh các buổi trong lịch</summary><ul className="divide-y divide-zinc-100 dark:divide-zinc-800">{lessons.filter(l => l.status !== 'CANCELLED').map(l => <li key={l.id} className="flex items-center justify-between gap-2 py-3"><div className="min-w-0 text-sm"><p className="truncate">{l.title}</p><p className="text-xs text-zinc-500">{localTime(l.startsAt).replace('T', ' ')}</p></div><Button variant="secondary" size="sm" icon={CheckCircle2} onClick={() => setAttendance(l)}>Điểm danh</Button></li>)}</ul></details>}
    </main></div>
    {editor && <LessonEditor key={`${editor.lesson?.id ?? 'new'}:${editor.start}`} {...editor} studentId={studentId} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); void mutate() }} />}
    {attendance && <AttendanceDialog lesson={attendance} onClose={() => setAttendance(null)} onSaved={() => { setAttendance(null); void mutate() }} />}
  </div>
}
