import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { emptySchedule, formatSchedule, scheduleBody, scheduleError, scheduleToForm, ScheduleFields, type ScheduleFormState } from './schedule-fields'

const form = (overrides: Partial<ScheduleFormState> = {}): ScheduleFormState => ({ ...emptySchedule('2026-09-17'), ...overrides })

describe('scheduleBody', () => {
  it('tính durationMin từ giờ bắt đầu/kết thúc và gửi đủ trường lặp', () => {
    const body = scheduleBody(form({ days: [4, 1], startTime: '18:00', endTime: '19:30', intervalWeeks: '2', ending: 'COUNT', occurrenceCount: '12' }))

    expect(body).toEqual({
      daysOfWeek: [1, 4],
      startTime: '18:00',
      durationMin: 90,
      startsOn: '2026-09-17',
      endsOn: null,
      intervalWeeks: 2,
      occurrenceCount: 12,
    })
  })

  it('chỉ gửi một trong endsOn và occurrenceCount', () => {
    const byDate = scheduleBody(form({ days: [2], ending: 'DATE', endsOn: '2026-12-31', occurrenceCount: '12' }))
    expect(byDate?.endsOn).toBe('2026-12-31')
    expect(byDate?.occurrenceCount).toBeNull()

    const byCount = scheduleBody(form({ days: [2], ending: 'COUNT', endsOn: '2026-12-31', occurrenceCount: '8' }))
    expect(byCount?.endsOn).toBeNull()
    expect(byCount?.occurrenceCount).toBe(8)
    expect(byCount?.endsOn).toBeNull()
  })

  it('trả null kèm câu lỗi tiếng Việt khi giờ kết thúc không sau giờ bắt đầu', () => {
    const invalid = form({ days: [1], startTime: '18:00', endTime: '18:00' })

    expect(scheduleBody(invalid)).toBeNull()
    expect(scheduleError(invalid)).toBe('Giờ kết thúc phải sau giờ bắt đầu trong cùng ngày')
  })

  it('bắt lỗi thiếu thứ, ngày kết thúc và số tuần lặp', () => {
    expect(scheduleError(form())).toBe('Chọn ít nhất một thứ trong tuần')
    expect(scheduleError(form({ days: [1], ending: 'DATE', endsOn: '2026-09-01' }))).toBe('Ngày kết thúc phải sau ngày bắt đầu')
    expect(scheduleError(form({ days: [1], intervalWeeks: '13' }))).toBe('Số tuần lặp phải từ 1 đến 12')
    expect(scheduleError(form({ days: [1], ending: 'COUNT', occurrenceCount: '0' }))).toBe('Số buổi phải từ 1 đến 500')
  })
})

describe('scheduleToForm', () => {
  it('đổ khung giờ của lớp sang form và suy ra giờ kết thúc', () => {
    expect(scheduleToForm({
      daysOfWeek: [4, 1],
      startTime: '18:00',
      durationMin: 90,
      startsOn: '2026-09-16T17:00:00.000Z',
      endsOn: null,
      intervalWeeks: 2,
      occurrenceCount: 8,
    })).toEqual({
      days: [1, 4],
      startTime: '18:00',
      endTime: '19:30',
      startsOn: '2026-09-17',
      intervalWeeks: '2',
      ending: 'COUNT',
      endsOn: '',
      occurrenceCount: '8',
    })
  })

  it('lịch không có số buổi thì hiểu là kết thúc theo ngày', () => {
    const state = scheduleToForm({ daysOfWeek: [1], startTime: '18:00', durationMin: 60, startsOn: '2026-09-16T17:00:00.000Z', endsOn: '2026-12-30T17:00:00.000Z' })

    expect(state.ending).toBe('DATE')
    expect(state.endsOn).toBe('2026-12-31')
  })
})

describe('formatSchedule', () => {
  it('thêm số tuần lặp và số buổi khi khác mặc định', () => {
    expect(formatSchedule({ daysOfWeek: [1], startTime: '18:00', durationMin: 60, intervalWeeks: 1, occurrenceCount: null })).toBe('T2 · 18:00 · 60 phút')
    expect(formatSchedule({ daysOfWeek: [1], startTime: '18:00', durationMin: 60, intervalWeeks: 2, occurrenceCount: 12 })).toBe('T2 · 18:00 · 60 phút · mỗi 2 tuần · 12 buổi')
  })
})

describe('ScheduleFields', () => {
  it('hiện đủ trường lịch lặp như bên Lịch học', () => {
    const html = renderToStaticMarkup(<ScheduleFields idPrefix="x" form={form({ days: [1] })} onChange={() => {}} />)

    expect(html).toContain('Các thứ trong tuần')
    expect(html).toContain('Giờ bắt đầu')
    expect(html).toContain('Giờ kết thúc')
    expect(html).toContain('Lặp mỗi bao nhiêu tuần')
    expect(html).toContain('Kết thúc lặp')
  })

  it('buổi lẻ chỉ hiện ngày và giờ', () => {
    const html = renderToStaticMarkup(<ScheduleFields idPrefix="x" form={form({ days: [1] })} onChange={() => {}} showRepeat={false} startsOnLabel="Ngày học" />)

    expect(html).toContain('Ngày học')
    expect(html).not.toContain('Các thứ trong tuần')
    expect(html).not.toContain('Kết thúc lặp')
  })
})
