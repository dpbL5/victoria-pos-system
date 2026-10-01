import { describe, expect, it } from 'vitest'
import { checkoutTotals } from './checkout-totals'

const base = {
  playGross: 0,
  itemsTotal: 0,
  discount: 0,
  parkingTotal: 0,
  depositRemaining: 0,
}

describe('checkoutTotals — chuỗi số của phiếu thu', () => {
  it('cộng giờ chơi với hàng hoá thành Tạm tính', () => {
    const totals = checkoutTotals({ ...base, playGross: 33_000, itemsTotal: 30_000 })

    expect(totals.charges).toBe(63_000)
    expect(totals.total).toBe(63_000)
    expect(totals.payable).toBe(63_000)
  })

  it('trừ khuyến mại và phí gửi xe khỏi Tạm tính', () => {
    const totals = checkoutTotals({
      ...base,
      playGross: 33_000,
      itemsTotal: 30_000,
      discount: 15_000,
      parkingTotal: 5_000,
    })

    expect(totals.total).toBe(43_000)
    expect(totals.payable).toBe(43_000)
  })

  it('khấu trừ tiền cọc vào Cần thu', () => {
    const totals = checkoutTotals({
      ...base,
      playGross: 18_000,
      depositRemaining: 18_000,
    })

    expect(totals.total).toBe(18_000)
    expect(totals.depositApplied).toBe(18_000)
    expect(totals.payable).toBe(0)
  })

  it('cọc lớn hơn hoá đơn thì chỉ khấu trừ bằng hoá đơn', () => {
    const totals = checkoutTotals({
      ...base,
      playGross: 18_000,
      depositRemaining: 100_000,
    })

    expect(totals.depositApplied).toBe(18_000)
    expect(totals.payable).toBe(0)
  })

  it('không để Tổng hoặc Cần thu âm khi khoản trừ vượt quá', () => {
    const totals = checkoutTotals({
      ...base,
      playGross: 10_000,
      discount: 10_000,
      parkingTotal: 5_000,
    })

    expect(totals.total).toBe(0)
    expect(totals.payable).toBe(0)
  })

  it('bỏ qua giá trị âm lọt vào', () => {
    const totals = checkoutTotals({
      ...base,
      playGross: -5_000,
      itemsTotal: 20_000,
      depositRemaining: -1_000,
    })

    expect(totals.charges).toBe(20_000)
    expect(totals.payable).toBe(20_000)
  })
})
