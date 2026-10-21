import { describe, expect, it } from 'vitest'
import { buildPlayCalendar } from './play-calendar-data'

const TODAY = '2026-10-21' // thứ Tư

describe('buildPlayCalendar', () => {
  it('dựng lưới tuần cho đúng năm dương lịch', () => {
    const weeks = buildPlayCalendar([], 2026, TODAY)
    const days = weeks.flatMap((week) => week.cells).filter((cell) => !cell.outside)

    expect(weeks).toHaveLength(53)
    expect(weeks.every((week) => week.cells.length === 7)).toBe(true)
    expect(weeks[0].cells[0].day).toBe('2025-12-29')
    expect(weeks[0].cells[0].outside).toBe(true)
    expect(days).toHaveLength(365)
    expect(days[0].day).toBe('2026-01-01')
    expect(days[days.length - 1].day).toBe('2026-12-31')
  })

  it('xử lý đúng năm nhuận', () => {
    const days = buildPlayCalendar([], 2024, TODAY)
      .flatMap((week) => week.cells)
      .filter((cell) => !cell.outside)

    expect(days).toHaveLength(366)
    expect(days[0].day).toBe('2024-01-01')
    expect(days[days.length - 1].day).toBe('2024-12-31')
  })

  it('gán giờ chơi đúng ngày và đánh dấu ngày tương lai', () => {
    const weeks = buildPlayCalendar([{ day: TODAY, hours: 2.5 }], 2026, TODAY)
    const week = weeks.find((item) => item.cells.some((cell) => cell.day === TODAY))
    const index = week?.cells.findIndex((cell) => cell.day === TODAY) ?? -1

    expect(week?.cells[index]).toMatchObject({ hours: 2.5, outside: false, future: false })
    expect(week?.cells[index + 1].future).toBe(true)
  })

  it('đặt nhãn tháng ở tuần chứa ngày mùng 1', () => {
    const weeks = buildPlayCalendar([], 2026, TODAY)
    const october = weeks.find((week) => week.cells.some((cell) => cell.day === '2026-10-01'))

    expect(weeks[0].monthLabel).toBe('Th1')
    expect(october?.monthLabel).toBe('Th10')
  })
})
