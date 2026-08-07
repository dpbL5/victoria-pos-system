// ── Ports — repository interfaces cho domain invoicing ─────
import type { Prisma } from '@/generated/prisma/client'
import type { InvoiceItemType } from '@/generated/prisma/client'
import type { PaymentMethod } from '@/types'

export interface CreateInvoiceLineInput {
  type: InvoiceItemType
  description: string
  quantity: number
  unitPrice: number
  subtotal: number
  discountAmount: number
  total: number
  metadata?: Prisma.InputJsonValue
}

export interface CreatePaidInvoiceInput {
  invoiceNo: string
  customerId: string
  shiftId: string
  staffId: string
  paidAt: Date
  notes?: string
  subtotal: number
  discountTotal: number
  grandTotal: number
  lines: CreateInvoiceLineInput[]
}

export interface CreatePaymentInput {
  invoiceId: string
  /** sessionId nullable cho thanh toán phi vận hành (phí hội viên) */
  sessionId?: string | null
  shiftId: string
  staffId: string
  totalHours: number
  subtotal: number
  discountTotal: number
  grandTotal: number
  paymentMethod: PaymentMethod
  paidAt: Date
  notes?: string
}

export interface EditStockMovementRef {
  id: string
  productId: string | null
  quantity: number
  unitCost: number | null
}

export interface EditInvoiceItemRef {
  id: string
  type: InvoiceItemType
  productId: string | null
  description: string
  quantity: number
  unitPrice: number
  subtotal: number
  discountAmount: number
  total: number
  metadata: Prisma.JsonValue | null
  stockMovements: EditStockMovementRef[]
}

export interface EditInvoiceTarget {
  id: string
  invoiceNo: string
  status: string
  shiftId: string | null
  customerId: string | null
  sessionId: string | null
  paidAt: Date | null
  notes: string | null
  subtotal: number
  discountTotal: number
  grandTotal: number
  staff: { fullName: string } | null
  items: EditInvoiceItemRef[]
  payments: Array<{ id: string; totalHours: number | null; paymentMethod: string | null }>
  membershipPayments: Array<{ id: string }>
}

export interface UpdateInvoiceFinancialsInput {
  subtotal: number
  discountTotal: number
  grandTotal: number
  notes: string
}

export interface CreateDraftInvoiceInput {
  invoiceNo: string
  customerId: string
  sessionId: string
  shiftId: string
  staffId: string
  subtotal: number
  discountTotal: number
  grandTotal: number
  notes?: string
}

export interface CreateInvoiceItemInput {
  invoiceId: string
  productId?: string | null
  type: InvoiceItemType
  description: string
  quantity: number
  unitPrice: number
  subtotal: number
  discountAmount: number
  total: number
  metadata?: Prisma.InputJsonValue
}

export interface DraftInvoiceRef {
  id: string
  items: Array<{ productId: string | null; quantity: number }>
}

export interface CreateMembershipPaymentInput {
  customerId: string
  membershipId: string
  planId: string
  invoiceId: string
  shiftId: string
  staffId: string
  amount: number
  paymentMethod: PaymentMethod
  paidAt: Date
  notes?: string
}

export interface VoidStockMovementRef {
  id: string
  productId: string | null
  quantity: number
  unitCost: number | null
}

export interface VoidInvoiceItemRef {
  id: string
  type: string
  productId: string | null
  stockMovements: VoidStockMovementRef[]
}

export interface VoidInvoiceTarget {
  id: string
  invoiceNo: string
  grandTotal: number
  status: string
  notes: string | null
  shiftId: string | null
  sessionId: string | null
  items: VoidInvoiceItemRef[]
  staff: { fullName: string } | null
}

export interface ReverseStockInput {
  invoiceItemId: string
  productId: string
  shiftId: string
  staffId: string
  quantity: number
  unitCost: number | null
  reason: string
}

export interface BillingRepository {
  /** Invoice + items + StockMovement SALE + staff — dùng cho void */
  findVoidTarget(invoiceId: string): Promise<VoidInvoiceTarget | null>
  /** Items (kèm StockMovement SALE) của các DRAFT invoice đã merge vào hoá đơn này */
  findMergedDraftItems(sessionId: string, invoiceNo: string): Promise<VoidInvoiceItemRef[]>
  /** Hoàn trả tồn kho: product.stockQuantity + StockMovement VOID */
  reverseStock(input: ReverseStockInput): Promise<void>
  /** Đánh dấu hoá đơn CANCELLED kèm notes */
  markInvoiceCancelled(invoiceId: string, notes: string): Promise<void>
  /** Tạo invoice PAID kèm line items (dùng cho phí hội viên, bán hàng...) */
  createPaidInvoice(input: CreatePaidInvoiceInput): Promise<{ id: string; invoiceNo: string }>
  /** Tạo payment cho invoice */
  createPayment(input: CreatePaymentInput): Promise<{ id: string }>
  /** Tạo MembershipPayment (phí hội viên) */
  createMembershipPayment(input: CreateMembershipPaymentInput): Promise<{ id: string }>
  /** Tạo invoice DRAFT (bán kèm phiên — chưa thanh toán) */
  createDraftInvoice(input: CreateDraftInvoiceInput): Promise<{ id: string; invoiceNo: string }>
  /** Tạo invoice item */
  createInvoiceItem(input: CreateInvoiceItemInput): Promise<{ id: string }>
  /** Cập nhật subtotal/grandTotal sau khi trừ phí gửi xe */
  updateInvoiceTotals(invoiceId: string, subtotal: number, grandTotal: number): Promise<void>
  /** Invoice DRAFT của phiên (gom sản phẩm bán kèm) */
  findDraftInvoices(sessionId: string): Promise<DraftInvoiceRef[]>
  /** Huỷ các invoice DRAFT đã gộp vào hoá đơn thanh toán */
  cancelDraftInvoices(ids: string[], notes: string): Promise<void>
  /** Invoice + items + stockMovements + payments + membershipPayments — cho edit-in-place */
  findByIdForEdit(invoiceId: string): Promise<EditInvoiceTarget | null>
  deleteInvoiceItems(invoiceId: string): Promise<void>
  deletePayments(invoiceId: string): Promise<void>
  updateInvoiceFinancials(invoiceId: string, input: UpdateInvoiceFinancialsInput): Promise<void>
}
