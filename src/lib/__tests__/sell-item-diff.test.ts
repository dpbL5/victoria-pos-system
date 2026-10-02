import { describe, it, expect } from 'vitest'

import { diffSellItems } from '@/lib/sessions/sell-item-diff'
import type { SessionSellItemRecord } from '@/lib/sessions/ports'

// Phép so này là nguồn sự thật cho tồn kho ở CẢ hai đường ghi (lưu khi đóng
// drawer và checkout), nên test kỹ ở đây thay vì chỉ test qua use-case.
const row = (
  id: string,
  productId: string,
  quantity: number,
  unitPrice = 10000,
): SessionSellItemRecord => ({
  id,
  sessionId: 'sess-1',
  productId,
  quantity,
  unitPrice,
  notes: null,
  createdAt: new Date('2026-08-07T10:00:00Z'),
})

const desired = (entries: Array<[string, number]>) => new Map(entries)

describe('diffSellItems', () => {
  it('desired = null (không hoà giải): giữ nguyên mọi dòng, không chênh lệch', () => {
    const existing = [row('a', 'p1', 2), row('b', 'p2', 3)]
    const result = diffSellItems(existing, null)

    expect(result.lines.map((l) => [l.productId, l.quantity])).toEqual([
      ['p1', 2],
      ['p2', 3],
    ])
    expect(result.stockDeltas).toEqual([])
    expect(result.removedIds).toEqual([])
    expect(result.newQuantities.size).toBe(0)
  })

  it('không đổi gì: cùng số lượng thì không sinh chênh lệch tồn kho', () => {
    const result = diffSellItems([row('a', 'p1', 2)], desired([['p1', 2]]))
    expect(result.stockDeltas).toEqual([])
    expect(result.lines).toHaveLength(1)
  })

  it('tăng số lượng: delta dương đúng phần lệch, giữ giá đã chốt', () => {
    const result = diffSellItems([row('a', 'p1', 2, 12000)], desired([['p1', 5]]))
    expect(result.stockDeltas).toEqual([{ productId: 'p1', delta: 3 }])
    expect(result.lines[0]).toMatchObject({ id: 'a', quantity: 5, unitPrice: 12000 })
  })

  it('giảm số lượng: delta âm, dòng vẫn còn', () => {
    const result = diffSellItems([row('a', 'p1', 5)], desired([['p1', 2]]))
    expect(result.stockDeltas).toEqual([{ productId: 'p1', delta: -3 }])
    expect(result.lines[0]).toMatchObject({ quantity: 2 })
    expect(result.removedIds).toEqual([])
  })

  // Bỏ dòng mà quên delta thì kho mất hàng vĩnh viễn — đây là case quan trọng nhất.
  it('bỏ hẳn dòng khỏi danh sách: hoàn kho đúng số đã bán, không còn dòng', () => {
    const result = diffSellItems([row('a', 'p1', 4)], desired([]))
    expect(result.stockDeltas).toEqual([{ productId: 'p1', delta: -4 }])
    expect(result.removedIds).toEqual(['a'])
    expect(result.lines).toEqual([])
  })

  it('sản phẩm chưa từng trên phiên: vào newQuantities, không sinh delta', () => {
    const result = diffSellItems([row('a', 'p1', 2)], desired([['p1', 2], ['p2', 3]]))
    expect(Array.from(result.newQuantities.entries())).toEqual([['p2', 3]])
    expect(result.stockDeltas).toEqual([])
    expect(result.lines).toHaveLength(1)
  })

  // Dữ liệu cũ có thể có nhiều dòng cùng sản phẩm. `desired` là số lượng cho cả
  // SẢN PHẨM, nên phải gộp — áp cho từng dòng sẽ nhân tổng lên và trừ thừa kho.
  it('nhiều dòng cùng sản phẩm: gộp còn 1 dòng, delta tính trên tổng', () => {
    const merged = diffSellItems([row('a', 'p1', 1), row('b', 'p1', 1)], desired([['p1', 2]]))
    expect(merged.lines.map((l) => [l.id, l.quantity])).toEqual([['a', 2]])
    expect(merged.removedIds).toEqual(['b'])
    // Tổng kho đang giữ = 2, desired = 2 → không phải bù gì
    expect(merged.stockDeltas).toEqual([])

    const smaller = diffSellItems([row('a', 'p1', 1), row('b', 'p1', 1)], desired([['p1', 1]]))
    expect(smaller.lines.map((l) => [l.id, l.quantity])).toEqual([['a', 1]])
    expect(smaller.removedIds).toEqual(['b'])
    expect(smaller.stockDeltas).toEqual([{ productId: 'p1', delta: -1 }])
  })

  it('không hoà giải thì KHÔNG gộp dòng trùng (giữ nguyên dữ liệu cũ)', () => {
    const result = diffSellItems([row('a', 'p1', 1), row('b', 'p1', 1)], null)
    expect(result.lines).toHaveLength(2)
    expect(result.removedIds).toEqual([])
    expect(result.stockDeltas).toEqual([])
  })

  it('desired = 0 cho một sản phẩm: coi như bỏ dòng, không tạo hàng mới', () => {
    const result = diffSellItems([row('a', 'p1', 2)], desired([['p1', 0]]))
    expect(result.removedIds).toEqual(['a'])
    expect(result.newQuantities.size).toBe(0)
  })
})
