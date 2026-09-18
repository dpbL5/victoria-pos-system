import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, expect, it, vi } from 'vitest'
import LessonsCalendar, { getOverlapStackIndex } from './lessons-calendar'
import type { Lesson } from './types'
import { createEventUi } from '@fullcalendar/react/protected-api'

const { callbacks } = vi.hoisted(() => ({
  callbacks: {} as Record<string, (info: unknown) => React.ReactNode>,
}))
const calendarProps = vi.hoisted(() => ({ current: {} as Record<string, unknown> }))
const lessonData = vi.hoisted(() => ({ current: [] as unknown[] }))
vi.mock('@fullcalendar/react', () => ({
  default: (props: Record<string, unknown>) => {
    calendarProps.current = props
    if (props.selectMirror) {
      for (const name of ['eventClass', 'eventContent', 'eventDidMount']) {
        callbacks[name] = props[name] as (info: unknown) => React.ReactNode
      }
    }
    return null
  },
}))
vi.mock('@/hooks/use-api', () => ({ useApi: (url: string | null) => url?.startsWith('/api/students') ? {} : { data: { data: { lessons: lessonData.current } } } }))
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({}) }))
vi.mock('./calendar-connection', () => ({ CalendarConnection: () => null, useCalendarStatus: () => ({ needsAttention: false }) }))
afterEach(() => { vi.unstubAllGlobals(); lessonData.current = [] })

it('hiển thị vùng kéo chọn chưa có buổi học và giữ trạng thái buổi đã huỷ', () => {
  vi.stubGlobal('React', React)
  vi.stubGlobal('window', { location: { search: '' }, innerWidth: 1200 })
  renderToStaticMarkup(<LessonsCalendar />)
  expect(calendarProps.current.slotEventOverlap).toBe(true)

  const setAttribute = vi.fn()
  const preview = { event: { extendedProps: {} }, timeText: '18:00 - 19:00', isMirror: true, el: { closest: vi.fn(), setAttribute } }
  expect(callbacks.eventClass(preview)).toBe('')
  expect(renderToStaticMarkup(<>{callbacks.eventContent(preview)}</>)).toContain('18:00 - 19:00')
  expect(() => callbacks.eventDidMount(preview)).not.toThrow()
  expect(setAttribute).not.toHaveBeenCalled()

  const lesson = { id: 'lesson', title: 'Lớp cung', startsAt: '2026-09-09T11:00:00Z', durationMin: 60, status: 'CANCELLED', students: [] }
  const saved = { ...preview, isMirror: false, event: { extendedProps: { lesson } } }
  expect(callbacks.eventClass(saved)).toBe('lesson-cancelled')
  expect(renderToStaticMarkup(<>{callbacks.eventContent(saved)}</>)).toContain('Lớp cung')
  callbacks.eventDidMount(saved)
  expect(setAttribute).toHaveBeenCalledWith('data-lesson-event', 'lesson')
  expect(setAttribute).toHaveBeenCalledWith('aria-label', expect.stringContaining('từ 2026-09-09 18:00 đến 19:00'))
  expect(setAttribute).toHaveBeenCalledWith('title', expect.stringContaining('Lớp cung'))
})

it('xếp các buổi giao nhau theo thứ tự bắt đầu', () => {
  const lessons = [
    { id: 'first', startsAt: '2026-09-09T09:00:00Z', durationMin: 120 },
    { id: 'second', startsAt: '2026-09-09T10:00:00Z', durationMin: 60 },
  ] as Lesson[]
  expect(getOverlapStackIndex(lessons[0], lessons)).toBe(0)
  expect(getOverlapStackIndex(lessons[1], lessons)).toBe(1)
})

it('gắn stack vào phần tử bọc thực tế của FullCalendar 7 và cập nhật khi đổi thứ tự', () => {
  vi.stubGlobal('React', React)
  vi.stubGlobal('window', { location: { search: '' }, innerWidth: 390 })
  renderToStaticMarkup(<LessonsCalendar />)
  const wrapper = { classList: { add: vi.fn() }, style: { setProperty: vi.fn() } }
  const el = { closest: vi.fn(() => ({ parentElement: wrapper })) }
  const render = (index: number, type = 'timeGridDay') => {
    const content = callbacks.eventContent({
      event: { extendedProps: { lesson: { title: 'Buổi học' }, overlapStackIndex: index } },
      view: { type },
    }) as React.ReactElement<{ ref: (el: unknown) => void }>
    content.props.ref(el)
  }
  render(1)
  expect(el.closest).toHaveBeenCalledWith('.lesson-calendar-event')
  expect(wrapper.classList.add).toHaveBeenCalledWith('lesson-stack-wrapper')
  expect(wrapper.style.setProperty).toHaveBeenLastCalledWith('--lesson-overlap-index', '1')
  render(2)
  expect(wrapper.style.setProperty).toHaveBeenLastCalledWith('--lesson-overlap-index', '2')
  wrapper.classList.add.mockClear()
  render(0, 'dayGridMonth')
  expect(wrapper.classList.add).not.toHaveBeenCalled()
})

it('FullCalendar 7 nhận class nhận diện thẻ từ dữ liệu lịch', () => {
  vi.stubGlobal('React', React)
  vi.stubGlobal('window', { location: { search: '' }, innerWidth: 390 })
  lessonData.current = [{ id: 'lesson', title: 'Học bắn cung', startsAt: '2026-09-09T06:00:00Z', durationMin: 120, status: 'SCHEDULED', students: [] }]
  renderToStaticMarkup(<LessonsCalendar />)
  const [event] = calendarProps.current.events as Parameters<typeof createEventUi>[0][]
  const ui = createEventUi(event, {} as Parameters<typeof createEventUi>[1])
  expect(ui.className).toContain('lesson-calendar-event')
})
