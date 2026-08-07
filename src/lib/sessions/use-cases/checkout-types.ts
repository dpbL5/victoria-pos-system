// ── Types dùng chung cho checkout / sell-items ─────
export interface CheckoutLine {
  productId: string
  type: 'PRODUCT' | 'SERVICE'
  description: string
  quantity: number
  unitPrice: number
  subtotal: number
}
