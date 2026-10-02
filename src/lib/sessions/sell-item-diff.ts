// ── Hoà giải dòng bán kèm của phiên ──────────────────────────────────────
// Một chỗ duy nhất quyết định "danh sách cuối người dùng muốn" khác gì "danh
// sách đang có trên phiên", để hai đường ghi cùng dùng:
//   - `PATCH /sell-items` khi nhân viên sửa hàng hoá rồi đóng drawer checkout
//   - `POST /checkout` khi bấm Thu tiền
// Hai đường mà tính chênh lệch khác nhau thì tồn kho sẽ lệch theo đường nào
// được gọi sau — nên phần này phải là hàm thuần, test được, không đụng DB.
//
// `desired === null` = KHÔNG hoà giải (client cũ không gửi danh sách): giữ
// nguyên mọi dòng đang có. Phân biệt này là cố ý — Map rỗng nghĩa là "phiếu
// không còn dòng nào", còn null nghĩa là "không biết, đừng đụng".

import type { SessionSellItemRecord } from './ports'

export interface SellItemLine {
  id: string
  productId: string
  quantity: number
  unitPrice: number
}

/** Chênh lệch tồn kho cần bù: >0 trừ thêm, <0 hoàn lại (chỉ áp cho PRODUCT) */
export interface SellItemStockDelta {
  productId: string
  delta: number
}

export interface SellItemDiff {
  /** Dòng còn lại trên phiếu, theo số lượng cuối. `unitPrice` giữ nguyên giá
   *  đã chốt lúc thêm vào phiên — sửa số lượng không được đổi giá. */
  lines: SellItemLine[]
  stockDeltas: SellItemStockDelta[]
  /** Dòng bị bỏ hẳn khỏi phiếu (vẫn phải hoàn kho — xem stockDeltas) */
  removedIds: string[]
  /** Sản phẩm có trong danh sách cuối nhưng chưa từng nằm trên phiên */
  newQuantities: Map<string, number>
}

export function diffSellItems(
  existing: SessionSellItemRecord[],
  desired: Map<string, number> | null,
): SellItemDiff {
  // Không hoà giải: giữ nguyên từng dòng, kể cả dòng trùng sản phẩm của dữ liệu
  // cũ. Không tính chênh lệch, không bỏ gì.
  if (desired === null) {
    return {
      lines: existing.map((item) => ({
        id: item.id,
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      })),
      stockDeltas: [],
      removedIds: [],
      newQuantities: new Map(),
    }
  }

  const lines: SellItemLine[] = []
  const stockDeltas: SellItemStockDelta[] = []
  const removedIds: string[] = []
  const existingProductIds = new Set<string>()
  // Gộp theo sản phẩm: `desired` là số lượng cho CẢ sản phẩm, không phải cho
  // từng dòng. Dữ liệu cũ có thể có nhiều dòng cùng sản phẩm; nếu áp desired cho
  // từng dòng thì tổng trên hoá đơn bị nhân lên và kho bị trừ thừa.
  const seenProductIds = new Set<string>()

  for (const item of existing) {
    existingProductIds.add(item.productId)
    if (seenProductIds.has(item.productId)) {
      // Dòng trùng: bỏ, phần kho của nó đã nằm trong delta tổng của sản phẩm
      removedIds.push(item.id)
      continue
    }
    seenProductIds.add(item.productId)

    const currentTotal = existing
      .filter((candidate) => candidate.productId === item.productId)
      .reduce((sum, candidate) => sum + candidate.quantity, 0)
    const target = desired.get(item.productId) ?? 0
    // Tính delta TRƯỚC khi xét bỏ dòng: bỏ hẳn (target 0) tức là hoàn kho đúng
    // số lượng đã bán kèm, bỏ qua bước này là mất hàng không hoàn lại.
    const delta = target - currentTotal
    if (delta !== 0) stockDeltas.push({ productId: item.productId, delta })
    if (target <= 0) {
      removedIds.push(item.id)
      continue
    }
    lines.push({
      id: item.id,
      productId: item.productId,
      quantity: target,
      unitPrice: item.unitPrice,
    })
  }

  const newQuantities = new Map<string, number>()
  for (const [productId, quantity] of desired) {
    if (quantity > 0 && !existingProductIds.has(productId)) {
      newQuantities.set(productId, quantity)
    }
  }

  return { lines, stockDeltas, removedIds, newQuantities }
}
