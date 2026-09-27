import React, { type ReactNode, type ReactElement } from 'react'
import { beforeEach, expect, it, vi } from 'vitest'
import { StudentLessonNote } from './lesson-notes'
import { LessonEditor } from './lesson-editor'
import { AttendanceDialog } from './attendance-dialog'
import { apiJson } from '@/lib/api'
import type { Lesson } from './types'

// Chạy các handler và lần render kế tiếp, không cần DOM hoặc thêm thư viện.
const hooks = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0 }))
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useEffect: () => {},
  useState: (initial: unknown) => {
    const index = hooks.cursor++
    if (!(index in hooks.values)) hooks.values[index] = typeof initial === 'function' ? initial() : initial
    return [hooks.values[index], (value: unknown) => {
      hooks.values[index] = typeof value === 'function' ? value(hooks.values[index]) : value
    }]
  },
}))
vi.mock('@/lib/api', () => ({ apiJson: vi.fn() }))
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }))
vi.mock('@/hooks/use-api', () => ({ useApi: () => ({}) }))

type Props = {
  children?: ReactNode; footer?: ReactNode; value?: string; disabled?: boolean
  onClick?: () => unknown; onChange?: (event: { target: { value: string } }) => void
  onSaved?: (lesson: Lesson) => void; onLessonChange?: (lesson: Lesson) => void
}
function elements(node: ReactNode): ReactElement<Props>[] {
  if (Array.isArray(node)) return node.flatMap(elements)
  if (!React.isValidElement<Props>(node)) return []
  return [node, ...elements(node.props.children), ...elements(node.props.footer)]
}
function render(component: () => ReactNode) {
  hooks.cursor = 0
  return elements(component())
}
const button = (nodes: ReactElement<Props>[], label: string) => nodes.find(node => node.props.children === label)!.props
const field = (nodes: ReactElement<Props>[]) => nodes.find(node => node.props.onChange && 'value' in node.props)!.props
const lesson = (version = 1, note: string | null = null): Lesson => ({
  id: 'l1', version, title: 'Lớp cung', startsAt: new Date(Date.now() - 7_200_000).toISOString(), durationMin: 60,
  status: 'SCHEDULED', note: null, shareNote: false, isException: false, originalStartAt: null, googleEventId: null,
  coachName: null, series: null, seriesId: null,
  students: [{ id: 'ls1', studentId: 's1', lessonId: 'l1', status: 'SCHEDULED', note, student: { id: 's1', fullName: 'A' } }],
})
beforeEach(() => { hooks.values = []; hooks.cursor = 0; vi.clearAllMocks() })

it('lưu điểm danh hai lần dùng phiên bản mới; trả bản đã lưu cho modal', async () => {
  const onSaved = vi.fn()
  const component = () => AttendanceDialog({ lesson: lesson(), onSaved, onClose: vi.fn() })
  vi.mocked(apiJson).mockResolvedValueOnce({ success: true, data: { lesson: lesson(2, 'Lần một') } })
  await button(render(component), 'Lưu điểm danh').onClick!()
  expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ version: 2 }))
  vi.mocked(apiJson).mockResolvedValueOnce({ success: true, data: { lesson: lesson(3, 'Lần hai') } })
  await button(render(component), 'Lưu điểm danh').onClick!()
  expect(JSON.parse(vi.mocked(apiJson).mock.calls[1][1]!.body as string).version).toBe(2)
})

it('inline giữ phiên bản lúc bắt đầu soạn khi props được tải lại', async () => {
  let version = 1
  const component = () => StudentLessonNote({ lessonId: 'l1', version, studentId: 's1', note: 'Cũ' })
  button(render(component), 'Ghi chú').onClick!()
  field(render(component)).onChange!({ target: { value: 'Bản đang soạn' } })
  version = 2
  vi.mocked(apiJson).mockResolvedValueOnce({ success: false, code: 'LESSON_CONFLICT', error: 'Xung đột' })
  await button(render(component), 'Lưu ghi chú').onClick!()
  expect(JSON.parse(vi.mocked(apiJson).mock.calls[0][1]!.body as string).version).toBe(1)
  expect(field(render(component)).value).toBe('Bản đang soạn')
  vi.mocked(apiJson).mockResolvedValueOnce({ success: true, data: lesson(2, 'Bản của người khác') })
  await button(render(component), 'Tải bản mới, giữ nội dung đang soạn').onClick!()
  expect(field(render(component)).value).toBe('Bản đang soạn')
  vi.mocked(apiJson).mockResolvedValueOnce({ success: true, data: { lesson: lesson(3, 'Bản đang soạn') } })
  await button(render(component), 'Lưu ghi chú').onClick!()
  expect(JSON.parse(vi.mocked(apiJson).mock.calls[2][1]!.body as string).version).toBe(2)
})

it('modal dùng phiên bản sau khi lưu note để lưu thông tin buổi', async () => {
  const current = lesson()
  const component = () => LessonEditor({ lesson: current, start: current.startsAt, end: new Date(Date.parse(current.startsAt) + 3_600_000).toISOString(), onSaved: vi.fn(), onClose: vi.fn() })
  render(component).find(node => node.type === AttendanceDialog)!.props.onLessonChange!(lesson(2, 'Đã lưu'))
  button(render(component), 'Sửa thông tin').onClick!()
  vi.mocked(apiJson).mockResolvedValueOnce({ success: true })
  await button(render(component), 'Lưu').onClick!()
  expect(JSON.parse(vi.mocked(apiJson).mock.calls[0][1]!.body as string).version).toBe(2)
})

it('buổi tương lai lưu note qua API notes, không chốt điểm danh', async () => {
  const current = { ...lesson(), startsAt: new Date(Date.now() + 3_600_000).toISOString() }
  const component = () => AttendanceDialog({ lesson: current, onSaved: vi.fn(), onClose: vi.fn() })
  expect(button(render(component), 'Lưu ghi chú chuẩn bị').disabled).toBe(true)
  field(render(component)).onChange!({ target: { value: 'Mang cung' } })
  vi.mocked(apiJson).mockResolvedValueOnce({ success: true, data: { lesson: lesson(2, 'Mang cung') } })
  await button(render(component), 'Lưu ghi chú chuẩn bị').onClick!()
  expect(apiJson).toHaveBeenCalledWith('/api/lessons/l1/notes', expect.objectContaining({ method: 'PATCH' }))
  expect(JSON.parse(vi.mocked(apiJson).mock.calls[0][1]!.body as string)).toEqual({ version: 1, entries: [{ studentId: 's1', note: 'Mang cung' }] })
})

it('điểm danh không gửi lại note chưa thay đổi', async () => {
  const component = () => AttendanceDialog({ lesson: lesson(1, 'Giữ ghi chú này'), onSaved: vi.fn(), onClose: vi.fn() })
  vi.mocked(apiJson).mockResolvedValueOnce({ success: true })
  await button(render(component), 'Lưu điểm danh').onClick!()
  expect(JSON.parse(vi.mocked(apiJson).mock.calls[0][1]!.body as string).entries).toEqual([{ studentId: 's1', status: 'SCHEDULED' }])
})

it('modal theo phiên bản mới sau khi hoà giải xung đột ở phần điểm danh', async () => {
  const current = lesson()
  const component = () => LessonEditor({ lesson: current, start: current.startsAt, end: new Date(Date.parse(current.startsAt) + 3_600_000).toISOString(), onSaved: vi.fn(), onClose: vi.fn() })
  render(component).find(node => node.type === AttendanceDialog)!.props.onLessonChange!(lesson(3, 'Sau xung đột'))
  button(render(component), 'Sửa thông tin').onClick!()
  vi.mocked(apiJson).mockResolvedValueOnce({ success: true })
  await button(render(component), 'Lưu').onClick!()
  expect(JSON.parse(vi.mocked(apiJson).mock.calls[0][1]!.body as string).version).toBe(3)
})
