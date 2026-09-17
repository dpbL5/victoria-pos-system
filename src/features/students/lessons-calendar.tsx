'use client'
import { startTransition, useCallback, useEffect, useRef, useState } from 'react'
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
import { CalendarDays, ChevronLeft, ChevronRight, Plus, School, Users, SlidersHorizontal, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Label, Select } from '@/components/ui/input'
import { NoticeCard } from '@/components/ui/notice-card'
import { useApi } from '@/hooks/use-api'
import { useToast } from '@/components/ui/toast'
import { useSWRConfig } from 'swr'
import { apiJson } from '@/lib/api'
import { LessonEditor, localTime, lockedLesson } from './lesson-editor'
import { CalendarConnection } from './calendar-connection'
import type { Lesson, Student } from './types'
import type { LessonClass } from '@/features/classes/types'

const VIEWS = { timeGridDay: 'Ngày', timeGridWeek: 'Tuần', dayGridMonth: 'Tháng', listWeek: 'Danh sách' }
function formatSlotLabel(text: string, hour12: boolean) {
  return hour12 ? text.replace(':00', '') : text.replace(/^0(?=\d)/, '').replace(':00', 'h')
}
export function getOverlapStackIndex(lesson: Lesson, lessons: Lesson[]) {
  const startsAt = Date.parse(lesson.startsAt)
  const endsAt = startsAt + lesson.durationMin * 60000
  return lessons
    .filter(candidate => {
      const candidateStartsAt = Date.parse(candidate.startsAt)
      return candidateStartsAt < endsAt && candidateStartsAt + candidate.durationMin * 60000 > startsAt
    })
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt) || a.id.localeCompare(b.id))
    .findIndex(candidate => candidate.id === lesson.id)
}
export default function LessonsCalendar({ classId, classTitle, classRoster = [], basePath = '/lessons' }: {
  classId?: string; classTitle?: string; classRoster?: { id: string; fullName: string }[]; basePath?: string
}) {
  const hour12 = new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hour12 ?? false
  const [initial] = useState(() => new URLSearchParams(window.location.search))
  const [view, setView] = useState(() => initial.get('view') ?? (window.innerWidth < 768 ? 'timeGridDay' : 'timeGridWeek'))
  const [date, setDate] = useState(() => initial.get('date') ?? localTime(new Date().toISOString()).slice(0, 10))
  const [title, setTitle] = useState('Lịch học')
  const [range, setRange] = useState<{ from: string; to: string } | null>(null)
  const [studentId, setStudentId] = useState(initial.get('studentId') ?? '')
  const [status, setStatus] = useState(initial.get('status') ?? '')
  const [classFilter, setClassFilter] = useState(classId ?? initial.get('classId') ?? '')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [editor, setEditor] = useState<{ lesson?: Lesson; start: string; end: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768)
  const ref = useRef<CalendarRef>(null)
  const toast = useToast()
  const { mutate: mutateCache } = useSWRConfig()
  const effectiveClassId = classId ?? classFilter
  const params = new URLSearchParams({ from: range?.from ?? '', to: range?.to ?? '', studentId, status, ...(effectiveClassId ? { classId: effectiveClassId } : {}) })
  const { data, error, isLoading, mutate } = useApi<{ lessons: Lesson[]; warning?: string }>(range ? `/api/lessons?${params}` : null)
  const { data: students } = useApi<Student[]>(classId ? null : '/api/students?limit=100')
  const { data: classes } = useApi<{ classes: LessonClass[] }>(classId ? null : '/api/classes')
  const lessons = data?.data?.lessons ?? []
  const activeFilterCount = [studentId, status, classId ? '' : classFilter].filter(Boolean).length
  useEffect(() => {
    const update = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])
  const persist = useCallback((values: Record<string, string>) => {
    const query = new URLSearchParams(window.location.search)
    for (const [key, value] of Object.entries(values)) { if (value) query.set(key, value); else query.delete(key) }
    window.history.replaceState(null, '', `${basePath}?${query}`)
  }, [basePath])
  const openNew = (start: string, end?: string) => {
    const actual = start.length === 10 ? `${start}T18:00:00+07:00` : start
    startTransition(() => setEditor({ start: actual, end: end ?? new Date(Date.parse(actual) + 3600000).toISOString() }))
  }
  async function move(info: EventDropInfo | EventResizeDoneInfo) {
    const lesson = lessons.find(l => l.id === info.event.id)
    if (!lesson || !info.event.start || !info.event.end || busy) { info.revert(); return }
    const start = info.event.start.toISOString()
    const end = info.event.end.toISOString()
    if (lesson.seriesId) { info.revert(); startTransition(() => setEditor({ lesson, start, end })); return }
    setBusy(true)
    try {
      const result = await apiJson(`/api/lessons/${lesson.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version: lesson.version, startsAt: start, durationMin: (Date.parse(end) - Date.parse(start)) / 60000 }) })
      if (!result.success) { info.revert(); toast.error(result.error || 'Không đổi được giờ học') }
      else { toast.success('Đã đổi lịch học'); void mutateCache('/api/google/status') }
      await mutate()
    } catch { info.revert(); toast.error('Không lưu được thay đổi. Hãy tải lại lịch'); await mutate() }
    finally { setBusy(false) }
  }
  return <div className="lessons-calendar lessons-calendar-shell min-h-full bg-white p-3 text-zinc-950 dark:bg-zinc-950 dark:text-white md:p-5">
    <div className="calendar-toolbar z-20 mb-3 flex min-w-0 flex-nowrap items-center gap-1 rounded-xl bg-surface-secondary p-1.5 ring-1 ring-border-default"><Button variant="ghost" size="sm" icon={CalendarDays} aria-label="Về hôm nay" title="Hôm nay" onClick={() => ref.current?.getApi().today()}><span className="hidden lg:inline">Hôm nay</span></Button><Button variant="ghost" size="sm" icon={ChevronLeft} aria-label="Khoảng trước" onClick={() => ref.current?.getApi().prev()} /><p className="min-w-0 flex-1 truncate text-center text-sm font-semibold md:text-base">{title}</p><Button variant="ghost" size="sm" icon={ChevronRight} aria-label="Khoảng sau" onClick={() => ref.current?.getApi().next()} /><Select aria-label="Chế độ xem lịch" className="!w-auto max-w-20 border-0 bg-transparent px-1.5 shadow-none lg:max-w-24" value={view} onChange={e => { setView(e.target.value); ref.current?.getApi().changeView(e.target.value) }}>{Object.entries(VIEWS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select><Button variant="ghost" icon={SlidersHorizontal} size="sm" aria-label={activeFilterCount ? `Bộ lọc lịch, đang áp dụng ${activeFilterCount}` : 'Bộ lọc lịch'} aria-expanded={filtersOpen} className="md:hidden" onClick={() => setFiltersOpen(v => !v)}>{activeFilterCount ? <span className="text-[10px]">{activeFilterCount}</span> : null}</Button><Link href="/students" aria-label="Học viên" title="Học viên" className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg px-2 text-sm text-blue-700 transition-colors hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring dark:text-blue-300 dark:hover:bg-blue-500/15"><Users size={18} /><span className="hidden lg:inline">Học viên</span></Link><CalendarConnection /><Link href="/classes" aria-label="Lớp học" title="Lớp học" className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg px-2 text-sm text-blue-700 transition-colors hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring dark:text-blue-300 dark:hover:bg-blue-500/15"><School size={18} /><span className="hidden lg:inline">Lớp học</span></Link><Button className="add-lesson-button" aria-label="Thêm buổi học" size="sm" icon={Plus} onClick={() => openNew(date)}>Thêm buổi</Button></div>
    <div className="calendar-body flex min-h-0 flex-1 flex-col gap-4 md:flex-row"><aside className={`${filtersOpen ? 'filter-panel-open' : 'hidden'} space-y-4 md:block md:w-48 md:shrink-0`}><div className="flex items-center justify-between md:hidden"><h2 className="font-semibold">Bộ lọc lịch</h2><Button variant="ghost" size="sm" icon={X} aria-label="Đóng bộ lọc" onClick={() => setFiltersOpen(false)} /></div>
      <div><Label htmlFor="calendar-date">Đến ngày</Label><Input id="calendar-date" type="date" value={date} onChange={e => { if (e.target.value) ref.current?.getApi().gotoDate(e.target.value) }} /></div>
      <div className="lesson-mini" aria-label="Chọn ngày trong tháng"><FullCalendar key={date.slice(0, 7)} plugins={[theme, dayGrid, interaction]} locale={vi} timeZone="Asia/Ho_Chi_Minh" initialView="dayGridMonth" initialDate={date} headerToolbar={false} height="auto" fixedWeekCount={false} firstDay={1} dayHeaderFormat={{ weekday: 'narrow' }} dayCellClass="lesson-mini-day" dateClick={info => ref.current?.getApi().gotoDate(info.dateStr)} /></div>
      {!classId && <div><Label htmlFor="calendar-class">Lớp</Label><Select id="calendar-class" value={classFilter} onChange={e => { setClassFilter(e.target.value); persist({ classId: e.target.value }) }}><option value="">Tất cả lớp</option>{classes?.data?.classes?.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></div>}
      {!classId && <div><Label htmlFor="calendar-student">Học viên</Label><Select id="calendar-student" value={studentId} onChange={e => { setStudentId(e.target.value); persist({ studentId: e.target.value }) }}><option value="">Tất cả học viên</option>{studentId && !students?.data?.some(s => s.id === studentId) && <option value={studentId}>Học viên đang chọn</option>}{students?.data?.map(s => <option key={s.id} value={s.id}>{s.fullName}</option>)}</Select></div>}
      <div><Label htmlFor="calendar-status">Trạng thái</Label><Select id="calendar-status" value={status} onChange={e => { setStatus(e.target.value); persist({ status: e.target.value }) }}><option value="">Các buổi chưa huỷ</option><option value="SCHEDULED">Đã xếp lịch</option><option value="COMPLETED">Hoàn thành</option><option value="CANCELLED">Đã huỷ</option></Select></div>
      <p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">Giờ Việt Nam · Kéo chọn để tạo buổi. Bấm buổi học để chỉnh sửa và ghi chú.</p>
    </aside><main className="calendar-main flex min-h-0 min-w-0 flex-1 flex-col">
      {(error || data?.success === false) && <NoticeCard tone="danger" title="Không tải được lịch" description={data?.error ?? 'Kiểm tra kết nối và thử lại'} action={<Button variant="secondary" size="sm" onClick={() => void mutate()}>Thử lại</Button>} />}
      {data?.data?.warning && <NoticeCard tone="warning" title="Lịch chưa được sinh đầy đủ" description={data.data.warning} />}
      <div className="mb-2 flex min-h-5 items-center gap-2 text-xs text-text-secondary" aria-live="polite"><span className="min-w-0 flex-1 truncate">{isLoading ? 'Đang tải lịch...' : `${lessons.length} buổi trong khoảng đang xem`}</span>{busy && <span>Đang lưu...</span>}<span className="shrink-0">GMT+7</span></div>
        <div className="calendar-grid flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl ring-1 ring-border-default">
        {/* @ts-expect-error FullCalendar runtime supports slotLabelContent, but v7.1 types omit it. */}
        <FullCalendar ref={ref} plugins={[theme, dayGrid, timeGrid, list, interaction]} locale={vi} timeZone="Asia/Ho_Chi_Minh" initialView={view in VIEWS ? view : 'timeGridWeek'} initialDate={date} headerToolbar={false} firstDay={1} height="100%" nowIndicator allDaySlot={false} slotMinTime="00:00:00" slotMaxTime="24:00:00" scrollTime="08:00:00" slotDuration="00:30:00" snapDuration="00:15:00" slotMinHeight={isMobile ? 40 : 18} selectable={!busy} selectMirror editable={!busy} eventDurationEditable eventResizableFromStart dayMaxEvents={3} slotEventOverlap slotLaneClass="lesson-slot" slotLabelContent={(info: { text: string }) => formatSlotLabel(info.text, hour12)} eventClass={info => info.event.extendedProps.lesson?.status === 'CANCELLED' ? 'lesson-cancelled' : ''} longPressDelay={500} eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
        dayHeaderContent={info => info.view.type.startsWith('timeGrid') ? <span className="inline-flex flex-col"><span>{['CN', 'Th 2', 'Th 3', 'Th 4', 'Th 5', 'Th 6', 'Th 7'][info.date.getUTCDay()]}</span><span>{info.date.getUTCDate()}/{info.date.getUTCMonth() + 1}</span></span> : info.text}
        datesSet={info => { const next = { from: info.start.toISOString(), to: info.end.toISOString() }; setRange(prev => prev?.from === next.from && prev.to === next.to ? prev : next); setTitle(info.view.title); const current = localTime(info.view.calendar.getDate().toISOString()).slice(0, 10); setDate(current); setView(info.view.type); persist({ date: current, view: info.view.type }) }}
        dateClick={info => openNew(info.dateStr)} select={info => { if (!info.allDay) openNew(info.start.toISOString(), info.end.toISOString()) }}
        events={lessons.map(l => ({ id: l.id, title: l.title, start: l.startsAt, end: new Date(Date.parse(l.startsAt) + l.durationMin * 60000).toISOString(), editable: !lockedLesson(l), className: ['lesson-calendar-event', l.status === 'CANCELLED' ? 'lesson-cancelled' : '', l.seriesId ? 'lesson-series' : ''].filter(Boolean).join(' '), extendedProps: { lesson: l, seriesId: l.seriesId, overlapStackIndex: getOverlapStackIndex(l, lessons) } }))}
        eventClick={info => { const lesson = lessons.find(l => l.id === info.event.id); if (lesson) startTransition(() => setEditor({ lesson, start: lesson.startsAt, end: new Date(Date.parse(lesson.startsAt) + lesson.durationMin * 60000).toISOString() })) }} eventDrop={info => void move(info)} eventResize={info => void move(info)}
        eventContent={info => { const lesson = info.event.extendedProps.lesson as Lesson | undefined; if (!lesson) return <div className="px-1">{info.timeText}</div>; return <p ref={el => { if (!el || !info.view.type.startsWith('timeGrid')) return; const wrapper = el.closest('.lesson-calendar-event')?.parentElement; if (wrapper) { wrapper.classList.add('lesson-stack-wrapper'); wrapper.style.setProperty('--lesson-overlap-index', String(info.isMirror ? 0 : info.event.extendedProps.overlapStackIndex ?? 0)) } }} className="whitespace-normal break-words px-1 font-medium leading-tight">{lesson.title}</p> }}
        eventDidMount={info => { const lesson = info.event.extendedProps.lesson as Lesson | undefined; if (!lesson || info.isMirror) return; const startsAt = info.event.start?.toISOString() ?? lesson.startsAt; const endsAt = info.event.end?.toISOString() ?? new Date(Date.parse(lesson.startsAt) + lesson.durationMin * 60000).toISOString(); const startLabel = localTime(startsAt).replace('T', ' '); const endLabel = localTime(endsAt).slice(11); const studentsLabel = lesson.students.map(s => s.student.fullName).join(', '); info.el.setAttribute('data-lesson-event', lesson.id); if (lesson.seriesId) info.el.setAttribute('data-lesson-series', lesson.seriesId); info.el.setAttribute('tabindex', '0'); info.el.setAttribute('role', 'button'); info.el.setAttribute('aria-label', `${lesson.title}, từ ${startLabel} đến ${endLabel}${lesson.series?.class?.name ?? lesson.class?.name ? `, lớp ${lesson.series?.class?.name ?? lesson.class?.name}` : ''}${lesson.seriesId ? ', thuộc chuỗi lặp' : ''}, mở để chỉnh sửa`); info.el.setAttribute('title', [lesson.title, `${startLabel} - ${endLabel}`, `Lớp: ${lesson.series?.class?.name ?? lesson.class?.name ?? 'chưa gán'}`, studentsLabel && `Học viên: ${studentsLabel}`, lesson.coachName && `Huấn luyện viên: ${lesson.coachName}`].filter(Boolean).join('\n')); info.el.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); info.el.click() } } }}
      /><Button className="add-lesson-fab md:hidden" aria-label="Thêm buổi học" title="Thêm buổi học" icon={Plus} onClick={() => openNew(date)} /></div>
    </main></div>
    {editor && <LessonEditor key={`${editor.lesson?.id ?? 'new'}:${editor.start}`} {...editor} studentId={studentId} classId={classId} defaultTitle={classTitle} defaultStudents={classRoster} onClose={() => startTransition(() => setEditor(null))} onSaved={() => { startTransition(() => setEditor(null)); void mutate(); void mutateCache('/api/google/status') }} />}
  </div>
}
