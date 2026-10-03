import { describe, expect, it } from 'vitest'
import {
  dayLabel,
  dayLedger,
  formatShiftDuration,
  participantNote,
  shiftLedger,
  shiftTimeRange,
  toolVerdict,
  type LedgerMoney,
} from './shift-ledger'

const closedShift = (overrides: Partial<LedgerMoney> = {}): LedgerMoney => ({
  status: 'CLOSED',
  openingCash: 1_000_000,
  expectedCash: 2_200_000,
  closingCash: 2_200_000,
  cashDifference: 0,
  revenue: { cashRevenue: 1_200_000 },
  ...overrides,
})

describe('shiftLedger', () => {
  it('ca đã đóng khớp: dùng số đã chốt ở server', () => {
    expect(shiftLedger(closedShift())).toEqual({
      expected: 2_200_000,
      counted: 2_200_000,
      difference: 0,
      verdict: 'matched',
    })
  })

  it('ca đã đóng thiếu tiền: lệch âm', () => {
    expect(
      shiftLedger(closedShift({ closingCash: 2_150_000, cashDifference: -50_000 })),
    ).toEqual({
      expected: 2_200_000,
      counted: 2_150_000,
      difference: -50_000,
      verdict: 'short',
    })
  })

  it('ca đã đóng thừa tiền: lệch dương', () => {
    expect(
      shiftLedger(closedShift({ closingCash: 2_250_000, cashDifference: 50_000 })).verdict,
    ).toBe('over')
  })

  it('ca đã đóng ưu tiên expectedCash đã chốt, không tính lại từ doanh thu', () => {
    const ledger = shiftLedger(
      closedShift({
        expectedCash: 2_200_000,
        closingCash: 2_200_000,
        cashDifference: 0,
        revenue: { cashRevenue: 900_000 },
      }),
    )
    expect(ledger.expected).toBe(2_200_000)
  })

  it('ca đang mở có doanh thu: dự kiến tạm tính từ đầu ca + tiền mặt thu', () => {
    expect(
      shiftLedger({
        status: 'OPEN',
        openingCash: 1_000_000,
        expectedCash: null,
        closingCash: null,
        revenue: { cashRevenue: 1_500_000 },
      }),
    ).toEqual({
      expected: 2_500_000,
      counted: null,
      difference: null,
      verdict: 'uncounted',
    })
  })

  it('ca đang mở thiếu doanh thu: không bịa dự kiến', () => {
    expect(
      shiftLedger({ status: 'OPEN', openingCash: 1_000_000 }).expected,
    ).toBeNull()
  })

  it('ca đã đóng nhưng thiếu số đếm: vẫn là chưa đếm', () => {
    expect(shiftLedger(closedShift({ closingCash: null, cashDifference: null })).verdict).toBe(
      'uncounted',
    )
  })

  it('đọc được chuỗi Decimal từ Prisma', () => {
    expect(
      shiftLedger({
        status: 'CLOSED',
        openingCash: '1000000',
        expectedCash: '2200000',
        closingCash: '2150000',
        cashDifference: '-50000',
      }).difference,
    ).toBe(-50_000)
  })
})

describe('dayLedger', () => {
  it('chỉ gộp ca đã đếm và đếm số ca chưa đếm', () => {
    expect(
      dayLedger([
        closedShift({ closingCash: 2_150_000, cashDifference: -50_000 }),
        { status: 'OPEN', openingCash: 500_000, revenue: { cashRevenue: 700_000 } },
      ]),
    ).toEqual({ verdict: 'short', difference: -50_000, countedCount: 1, unsettledCount: 1 })
  })

  it('ngày chưa có ca nào đếm: chưa đối soát được', () => {
    expect(dayLedger([{ status: 'OPEN', openingCash: 0 }])).toEqual({
      verdict: 'uncounted',
      difference: 0,
      countedCount: 0,
      unsettledCount: 1,
    })
  })

  it('khớp khi tổng lệch bằng 0', () => {
    expect(dayLedger([closedShift(), closedShift()]).verdict).toBe('matched')
  })
})

describe('toolVerdict', () => {
  it('khớp, lệch, và chưa nhập số cuối ca', () => {
    expect(toolVerdict(5, 5)).toBe('matched')
    expect(toolVerdict(5, 4)).toBe('mismatched')
    expect(toolVerdict(5, null)).toBe('uncounted')
  })
})

describe('participantNote', () => {
  const staff = (id: string, fullName: string) => ({ id, staff: { id, fullName } })

  it('bỏ người mở ca và gộp người đã rời', () => {
    expect(
      participantNote(
        [
          { ...staff('a', 'Trần Văn A'), leftAt: null },
          { ...staff('b', 'Nguyễn Thị B'), leftAt: null },
          { ...staff('c', 'Lê Văn C'), leftAt: '2026-10-03T09:00:00.000Z' },
        ],
        'a',
      ),
    ).toBe('Cùng ca: Nguyễn Thị B (+1 đã rời)')
  })

  it('chỉ có người mở ca: không có gì để nói', () => {
    expect(participantNote([{ ...staff('a', 'Trần Văn A'), leftAt: null }], 'a')).toBeNull()
  })

  it('quá 3 người: gộp phần dư', () => {
    expect(
      participantNote(
        [staff('b', 'B'), staff('c', 'C'), staff('d', 'D'), staff('e', 'E')].map((row) => ({
          ...row,
          leftAt: null,
        })),
        'a',
      ),
    ).toBe('Cùng ca: B, C, D +1')
  })
})

describe('dayLabel', () => {
  it('dựng nhãn từ khoá ngày, không phụ thuộc múi giờ máy', () => {
    expect(dayLabel('2024-01-01')).toBe('Thứ Hai, 01/01/2024')
    expect(dayLabel('2024-01-07')).toBe('Chủ nhật, 07/01/2024')
  })
})

describe('formatShiftDuration', () => {
  it('phút, giờ, và cả hai', () => {
    expect(formatShiftDuration('2026-10-03T08:00:00.000Z', '2026-10-03T08:40:00.000Z')).toBe(
      '40 phút',
    )
    expect(formatShiftDuration('2026-10-03T08:00:00.000Z', '2026-10-03T16:00:00.000Z')).toBe(
      '8 giờ',
    )
    expect(formatShiftDuration('2026-10-03T08:00:00.000Z', '2026-10-03T16:28:00.000Z')).toBe(
      '8 giờ 28 phút',
    )
  })
})

describe('shiftTimeRange', () => {
  it('ca trong ngày: chỉ in giờ đóng', () => {
    // 01:00Z = 08:00 giờ VN, 09:00Z = 16:00 giờ VN
    expect(shiftTimeRange('2026-10-03T01:00:00.000Z', '2026-10-03T09:00:00.000Z')).toBe(
      'Ca 08:00 – 16:00',
    )
  })

  it('ca qua ngày: kèm ngày đóng để không mâu thuẫn với số giờ', () => {
    // mở 22:00 ngày 03/10 (VN), đóng 02:00 ngày 04/10 (VN)
    expect(shiftTimeRange('2026-10-03T15:00:00.000Z', '2026-10-03T19:00:00.000Z')).toBe(
      'Ca 22:00 – 02:00 04/10',
    )
  })

  it('ca đang mở: chỉ có giờ mở', () => {
    expect(shiftTimeRange('2026-10-03T01:00:00.000Z', null)).toBe('Ca 08:00')
  })
})
