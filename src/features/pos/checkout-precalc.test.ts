import { describe, expect, it } from 'vitest'
import { precalcPlayTime, type PrecalcPlayer } from './checkout-precalc'

const START = '2026-09-30T10:00:00.000Z'
const END = '2026-09-30T11:00:00.000Z'

function player(over: Partial<PrecalcPlayer> = {}): PrecalcPlayer {
  return {
    id: 'p1',
    name: 'Người 1',
    pausedAt: null,
    totalPausedSeconds: 0,
    rule: { name: 'Bảng giá thường', ratePerHour: 100_000, tiers: [] },
    ...over,
  }
}

const noSessionPause = { pausedAt: null, totalPausedSeconds: 0 }

describe('precalcPlayTime — tính tiền giờ chơi tại client', () => {
  it('cộng dồn từng người: 2 người × 1h × 100k = 200k', () => {
    const quote = precalcPlayTime({
      startTime: START,
      endTime: END,
      promotion: null,
      sessionPause: noSessionPause,
      players: [player({ id: 'p1' }), player({ id: 'p2', name: 'Người 2' })],
    })

    expect(quote?.totalHours).toBe(2)
    expect(quote?.subtotal).toBe(200_000)
    expect(quote?.grandTotal).toBe(200_000)
    expect(quote?.playerPricing).toHaveLength(2)
    expect(quote?.playerPricing?.map((p) => p.total)).toEqual([100_000, 100_000])
  })

  it('áp giá luỹ tiến theo tier: 3h, base 100k, tier từ giờ thứ 2 = 80k → 280k', () => {
    const quote = precalcPlayTime({
      startTime: '2026-09-30T10:00:00.000Z',
      endTime: '2026-09-30T13:00:00.000Z',
      promotion: null,
      sessionPause: noSessionPause,
      players: [player({ rule: { name: 'Luỹ tiến', ratePerHour: 100_000, tiers: [{ minHours: 2, ratePerHour: 80_000 }] } })],
    })

    expect(quote?.totalHours).toBe(3)
    expect(quote?.subtotal).toBe(280_000)
  })

  it('trừ pause riêng của từng người: 1h chơi, nghỉ 30 phút → 50k', () => {
    const quote = precalcPlayTime({
      startTime: START,
      endTime: END,
      promotion: null,
      sessionPause: noSessionPause,
      players: [player({ totalPausedSeconds: 1800 })],
    })

    expect(quote?.totalHours).toBe(0.5)
    expect(quote?.subtotal).toBe(50_000)
  })

  it('pause đang chạy (pausedAt) được tính tới thời điểm chốt', () => {
    const quote = precalcPlayTime({
      startTime: START,
      endTime: END,
      promotion: null,
      sessionPause: noSessionPause,
      players: [player({ pausedAt: '2026-09-30T10:30:00.000Z' })],
    })

    expect(quote?.totalHours).toBe(0.5)
    expect(quote?.subtotal).toBe(50_000)
  })

  it('phiên 1 người chưa đồng bộ pause xuống player → lấy pause session-level', () => {
    const quote = precalcPlayTime({
      startTime: START,
      endTime: END,
      promotion: null,
      sessionPause: { pausedAt: null, totalPausedSeconds: 1800 },
      players: [player()],
    })

    expect(quote?.totalHours).toBe(0.5)
  })

  it('khuyến mại áp cho từng người rồi cộng lại', () => {
    const quote = precalcPlayTime({
      startTime: START,
      endTime: END,
      promotion: { ruleId: 'promo-1', name: 'Giảm 50%', discountType: 'PERCENT', discountValue: 50 },
      sessionPause: noSessionPause,
      players: [player({ id: 'p1' }), player({ id: 'p2' })],
    })

    expect(quote?.subtotal).toBe(200_000)
    expect(quote?.discountAmount).toBe(100_000)
    expect(quote?.grandTotal).toBe(100_000)
  })

  it('không có người chơi nào → trả null để fallback về quote server', () => {
    expect(
      precalcPlayTime({
        startTime: START,
        endTime: END,
        promotion: null,
        sessionPause: noSessionPause,
        players: [],
      }),
    ).toBeNull()
  })
})
