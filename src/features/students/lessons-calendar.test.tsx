import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, expect, it, vi } from 'vitest'
import LessonsCalendar from './lessons-calendar'

const { callbacks } = vi.hoisted(() => ({
  callbacks: {} as Record<string, (info: unknown) => React.ReactNode>,
}))
vi.mock('@fullcalendar/react', () => ({
  default: (props: Record<string, unknown>) => {
    if (props.selectMirror) {
      for (const name of ['eventClass', 'eventContent', 'eventDidMount']) {
        callbacks[name] = props[name] as (info: unknown) => React.ReactNode
      }
    }
    return null
  },
}))
vi.mock('@/hooks/use-api', () => ({ useApi: () => ({}) }))
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({}) }))
vi.mock('./calendar-connection', () => ({ CalendarConnection: () => null }))
afterEach(() => vi.unstubAllGlobals())

it('hiển thị vùng kéo chọn chưa có buổi học và giữ trạng thái buổi đã huỷ', () => {
  vi.stubGlobal('React', React)
  vi.stubGlobal('window', { location: { search: '' }, innerWidth: 1200 })
  renderToStaticMarkup(<LessonsCalendar />)

  const setAttribute = vi.fn()
  const preview = { event: { extendedProps: {} }, timeText: '18:00 - 19:00', isMirror: true, el: { setAttribute } }
  expect(callbacks.eventClass(preview)).toBe('')
  expect(renderToStaticMarkup(<>{callbacks.eventContent(preview)}</>)).toContain('18:00 - 19:00')
  expect(() => callbacks.eventDidMount(preview)).not.toThrow()
  expect(setAttribute).not.toHaveBeenCalled()

  const lesson = { id: 'lesson', title: 'Lớp cung', startsAt: '2026-09-09T11:00:00Z', status: 'CANCELLED', students: [] }
  const saved = { ...preview, isMirror: false, event: { extendedProps: { lesson } } }
  expect(callbacks.eventClass(saved)).toBe('lesson-cancelled')
  expect(renderToStaticMarkup(<>{callbacks.eventContent(saved)}</>)).toContain('Lớp cung')
  callbacks.eventDidMount(saved)
  expect(setAttribute).toHaveBeenCalledWith('data-lesson-event', 'lesson')
})
