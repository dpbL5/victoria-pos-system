import { describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: () => {}, back: () => {}, push: () => {} }),
}))

import { groupShiftsByDate, shiftOptionLabel } from './shift-transactions-screen'
import type { Shift } from '@/features/pos/types'

const shift = (id: string, openedAt: string, fullName?: string): Shift => ({
  id,
  openedAt,
  status: 'CLOSED',
  openingCash: 0,
  ...(fullName ? { staff: { id: `user-${id}`, fullName } } : {}),
})

describe('Bộ chọn ngày + ca ở màn Giao dịch trong ca', () => {
  it('gom ca theo ngày giờ VN — ca mở 00:00 giờ VN thuộc đúng ngày đó', () => {
    const grouped = groupShiftsByDate([
      shift('a', '2026-10-01T17:00:00.000Z'), // 00:00 ngày 02/10 giờ VN
      shift('b', '2026-10-02T03:00:00.000Z'), // 10:00 ngày 02/10 giờ VN
    ])

    expect([...grouped.keys()]).toEqual(['2026-10-02'])
    expect(grouped.get('2026-10-02')?.map((s) => s.id)).toEqual(['a', 'b'])
  })

  it('trong cùng ngày, ca sắp theo giờ mở tăng dần', () => {
    const grouped = groupShiftsByDate([
      shift('chieu', '2026-10-02T07:00:00.000Z'), // 14:00 giờ VN
      shift('sang', '2026-10-02T01:00:00.000Z'), // 08:00 giờ VN
    ])

    expect(grouped.get('2026-10-02')?.map((s) => s.id)).toEqual(['sang', 'chieu'])
  })

  it('nhãn ca = giờ mở · người mở ca, không kèm trạng thái mở/đóng', () => {
    expect(shiftOptionLabel(shift('a', '2026-10-02T01:00:00.000Z', 'Nguyễn An'))).toBe('08:00 · Nguyễn An')
    expect(shiftOptionLabel(shift('b', '2026-10-02T01:00:00.000Z'))).toBe('08:00')
  })
})
