import { describe, expect, it } from 'vitest'
import { currentMonth, isCurrentMonth, monthRange, monthWeeks, shiftMonth } from './reports-month-filter'

// 10:00 ngày 15/03/2026 giờ VN (UTC+7) — mốc test tất định cho mọi hàm theo tháng.
const NOW = new Date('2026-03-15T03:00:00.000Z')

describe('currentMonth', () => {
  it('trả đúng năm/tháng theo giờ VN', () => {
    expect(currentMonth(NOW)).toEqual({ year: 2026, month: 3 })
  })

  it('mốc UTC lệch ngày vẫn tính theo ngày VN', () => {
    // 17:00 UTC 31/03 → 00:00 ngày 01/04 giờ VN
    expect(currentMonth(new Date('2026-03-31T17:00:00.000Z'))).toEqual({ year: 2026, month: 4 })
  })
})

describe('shiftMonth', () => {
  it('lùi/tới trong cùng năm', () => {
    expect(shiftMonth({ year: 2026, month: 3 }, -1)).toEqual({ year: 2026, month: 2 })
    expect(shiftMonth({ year: 2026, month: 3 }, 1)).toEqual({ year: 2026, month: 4 })
  })

  it('cuộn qua năm', () => {
    expect(shiftMonth({ year: 2025, month: 12 }, 1)).toEqual({ year: 2026, month: 1 })
    expect(shiftMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 })
  })
})

describe('monthRange', () => {
  it('tháng đã qua: từ ngày 1 tới ngày cuối tháng', () => {
    expect(monthRange({ year: 2026, month: 2 }, NOW)).toEqual({ from: '2026-02-01', to: '2026-02-28' })
  })

  it('tháng hiện tại: chặn trên ở hôm nay', () => {
    expect(monthRange({ year: 2026, month: 3 }, NOW)).toEqual({ from: '2026-03-01', to: '2026-03-15' })
  })

  it('tháng 2 nhuận đủ 29 ngày', () => {
    expect(monthRange({ year: 2024, month: 2 }, NOW)).toEqual({ from: '2024-02-01', to: '2024-02-29' })
  })
})

describe('isCurrentMonth', () => {
  it('đúng tháng hiện tại', () => {
    expect(isCurrentMonth({ year: 2026, month: 3 }, NOW)).toBe(true)
  })

  it('tháng khác', () => {
    expect(isCurrentMonth({ year: 2026, month: 2 }, NOW)).toBe(false)
    expect(isCurrentMonth({ year: 2025, month: 3 }, NOW)).toBe(false)
  })
})

describe('monthWeeks', () => {
  it('tháng đã qua: tuần T2–CN giao với tháng, có thể lấn tháng kề', () => {
    // 01/02/2026 là Chủ nhật → tuần đầu bắt đầu từ 26/01
    expect(monthWeeks({ year: 2026, month: 2 }, NOW)).toEqual([
      { from: '2026-01-26', to: '2026-02-01', label: '26/01–01/02' },
      { from: '2026-02-02', to: '2026-02-08', label: '02/02–08/02' },
      { from: '2026-02-09', to: '2026-02-15', label: '09/02–15/02' },
      { from: '2026-02-16', to: '2026-02-22', label: '16/02–22/02' },
      { from: '2026-02-23', to: '2026-03-01', label: '23/02–01/03' },
    ])
  })

  it('tháng hiện tại: chặn tuần chứa hôm nay ở hôm nay và bỏ tuần tương lai', () => {
    // 20/10/2026 (VN) — 01/10 là Thứ Năm → tuần đầu bắt đầu 28/09
    const weeks = monthWeeks({ year: 2026, month: 10 }, new Date('2026-10-20T03:00:00.000Z'))
    expect(weeks).toEqual([
      { from: '2026-09-28', to: '2026-10-04', label: '28/09–04/10' },
      { from: '2026-10-05', to: '2026-10-11', label: '05/10–11/10' },
      { from: '2026-10-12', to: '2026-10-18', label: '12/10–18/10' },
      { from: '2026-10-19', to: '2026-10-20', label: '19/10–25/10' },
    ])
  })
})
