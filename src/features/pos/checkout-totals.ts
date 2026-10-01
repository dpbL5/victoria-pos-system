// ── Chuỗi số học của phiếu thu ───────────────────────────────────────────
// Một hướng duy nhất, mỗi khoản xuất hiện đúng một lần trong phép cộng:
//   Tạm tính = tiền giờ theo giá niêm yết + hàng hoá/dịch vụ
//   Tổng     = Tạm tính − khuyến mại giờ chơi − phí gửi xe
//   Cần thu  = Tổng − tiền cọc được khấu trừ
// Tách khỏi component để khoá bằng test — đây là số tiền thật của khách.

export interface CheckoutTotalsInput {
  /** Tiền giờ chơi theo giá niêm yết, trước khuyến mại (quote.subtotal) */
  playGross: number
  /** Hàng hoá/dịch vụ: dòng đã thêm vào phiên + dòng chọn lúc thu */
  itemsTotal: number
  /** Khuyến mại giờ chơi, số dương */
  discount: number
  /** Phí gửi xe, số dương */
  parkingTotal: number
  /** Tiền cọc còn lại của lịch đặt, số dương */
  depositRemaining: number
}

export interface CheckoutTotals {
  /** Tạm tính — tổng các dòng đang thu */
  charges: number
  /** Tổng — sau khuyến mại và phí gửi xe */
  total: number
  /** Phần tiền cọc thực sự khấu trừ (không vượt quá Tổng) */
  depositApplied: number
  /** Cần thu — số ghi ở chân phiếu cạnh nút thu */
  payable: number
}

export function checkoutTotals(input: CheckoutTotalsInput): CheckoutTotals {
  const charges =
    Math.max(0, input.playGross) + Math.max(0, input.itemsTotal)
  const total = Math.max(
    0,
    charges - Math.max(0, input.discount) - Math.max(0, input.parkingTotal),
  )
  const depositApplied = Math.min(Math.max(0, input.depositRemaining), total)
  return { charges, total, depositApplied, payable: total - depositApplied }
}
