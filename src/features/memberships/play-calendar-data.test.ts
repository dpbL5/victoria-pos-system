import { describe, expect, it } from 'vitest'
import { buildPlayCalendar } from './play-calendar-data'

const TODAY = '2026-10-21'

const allCells = (columns: ReturnType<typeof buildPlayCalendar>) =>
  columns.flatMap((column) => column.cells)

describe('buildPlayCalendar', () => {
  it('mỗi cột đúng 2 tuần (14 ô), cả năm phủ đủ 365 ngày', () => {
    const columns = buildPlayCalendar([], 2026, TODAY)

    expect(columns).toHaveLength(27)
    expect(columns.every((column) => column.cells.length === 14)).toBe(true)
    expect(allCells(columns).filter((cell) => cell !== null)).toHaveLength(365)
  })

  it('đệm null cho ngày ngoài năm ở cột đầu và cột cuối', () => {
    const columns = buildPlayCalendar([], 2026, TODAY)

    // 2026 bắt đầu thứ Năm: cột đầu chứa T2 29/12/2025 → T4 31/12 là ngoài năm.
    expect(columns[0].cells.slice(0, 3)).toEqual([null, null, null])
    expect(columns[0].cells[3]).toMatchObject({ day: '2026-01-01' })
    // Cột cuối chỉ có 1 tuần của năm → 7 ô cuối là null.
    expect(columns[26].cells.slice(7)).toEqual(Array(7).fill(null))
  })

  it('giữ ngày 29/02 của năm nhuận', () => {
    const days = allCells(buildPlayCalendar([], 2024, TODAY))
      .filter((cell) => cell !== null)
      .map((cell) => cell.day)

    expect(days).toHaveLength(366)
    expect(days).toContain('2024-02-29')
  })

  it('gán nhãn tháng cho cột chứa ngày mùng 1', () => {
    const columns = buildPlayCalendar([], 2026, TODAY)

    expect(columns[0].monthLabel).toBe('Th1')
    expect(columns.some((column) => column.monthLabel === 'Th10')).toBe(true)
    expect(columns.filter((column) => column.monthLabel).map((column) => column.monthLabel))
      .toEqual(['Th1', 'Th2', 'Th3', 'Th4', 'Th5', 'Th6', 'Th7', 'Th8', 'Th9', 'Th10', 'Th11', 'Th12'])
  })

  it('gán giờ chơi đúng ngày và đánh dấu ngày tương lai', () => {
    const columns = buildPlayCalendar([{ day: TODAY, hours: 2.5 }], 2026, TODAY)
    const cells = allCells(columns)
    const todayCell = cells.find((cell) => cell?.day === TODAY)
    const tomorrowCell = cells.find((cell) => cell?.day === '2026-10-22')

    expect(todayCell).toMatchObject({ hours: 2.5, future: false })
    expect(tomorrowCell).toMatchObject({ future: true })
  })
})
