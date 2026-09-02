// ── Use-case: editInvoice — sửa hoá đơn đã thanh toán (in-place, có audit) ─────
import type { DomainError, Result } from '@/lib/shared/result'
import { fail, runInTransaction } from '@/lib/infrastructure/db-helpers'
import type { Repositories } from '@/lib/infrastructure/repositories'
import type { HttpErrorInfo } from '@/lib/infrastructure/api-helpers'
import type { Prisma } from '@/generated/prisma/client'
import type { PaymentMethod } from '@/types'

export interface EditInvoiceInput {
  invoiceId: string
  staffId: string
  items: { productId: string; quantity: number }[]
  paymentMethod: PaymentMethod
  notes?: string | null
}

export interface EditInvoiceResult {
  invoiceId: string
  invoiceNo: string
  grandTotal: number
}

// Không nhận deps: Repositories vì toàn bộ logic nằm trong transaction —
// repos được inject bởi runInTransaction. Unit test gọi trực tiếp runEditInvoice.
export async function editInvoice(
  input: EditInvoiceInput
): Promise<Result<EditInvoiceResult>> {
  return runInTransaction((tx) => runEditInvoice(tx, input))
}

/**
 * Thân transaction — tách riêng để unit test với fake repositories.
 * Lỗi validation trong tx dùng fail() → throw RollbackSignal → rollback.
 */
export async function runEditInvoice(
  tx: Repositories,
  input: EditInvoiceInput
): Promise<EditInvoiceResult> {
  const { invoiceId, staffId, items, paymentMethod, notes } = input

  // ── 1. Read + guard ──
  const invoice = await tx.billing.findByIdForEdit(invoiceId)
  if (!invoice) fail('INVOICE_NOT_FOUND')
  if (invoice.status !== 'PAID') fail('INVOICE_NOT_EDITABLE')
  if (!invoice.shiftId) fail('SHIFT_CLOSED')
  if (invoice.payments.some((p) => p.kind === 'MEMBERSHIP')) fail('INVOICE_HAS_MEMBERSHIP')

  const actorName = invoice.staff?.fullName ?? staffId
  const timestamp = new Date().toISOString()
  const oldGrandTotal = invoice.grandTotal
  const oldPayment = invoice.payments[0]
  let reversedStockQty = 0

  // ── Snapshot BEFORE (cho audit) ──
  const beforeSnapshot = {
    status: invoice.status,
    subtotal: invoice.subtotal,
    discountTotal: invoice.discountTotal,
    grandTotal: oldGrandTotal,
    paymentMethod: oldPayment?.paymentMethod ?? null,
    notes: invoice.notes,
    items: invoice.items.map((i) => ({
      type: i.type,
      description: i.description,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      subtotal: i.subtotal,
      total: i.total,
    })),
  }

  // ── 2. Reverse stock (own items) ──
  for (const item of invoice.items) {
    if (!item.productId) continue
    for (const movement of item.stockMovements) {
      const returnQty = Math.abs(movement.quantity)
      await tx.billing.reverseStock({
        invoiceItemId: item.id,
        productId: movement.productId ?? item.productId,
        shiftId: invoice.shiftId,
        staffId,
        quantity: returnQty,
        reason: `Sửa hoá đơn ${invoice.invoiceNo} bởi ${actorName}`,
      })
      reversedStockQty += returnQty
    }
  }

  // ── 3. Reverse stock (merged DRAFT invoices) ──
  if (invoice.sessionId) {
    const draftItems = await tx.billing.findMergedDraftItems(invoice.sessionId, invoice.invoiceNo)
    for (const item of draftItems) {
      if (!item.productId) continue
      for (const movement of item.stockMovements) {
        const returnQty = Math.abs(movement.quantity)
        await tx.billing.reverseStock({
          invoiceItemId: item.id,
          productId: movement.productId ?? item.productId,
          shiftId: invoice.shiftId,
          staffId,
          quantity: returnQty,
          reason: `Sửa hoá đơn gộp ${invoice.invoiceNo} bởi ${actorName}`,
        })
        reversedStockQty += returnQty
      }
    }
  }

  // ── 4. Delete old items + payment ──
  await tx.billing.deleteInvoiceItems(invoiceId)
  await tx.billing.deletePayments(invoiceId)

  // ── 5. Validate + price new lines ──
  const productIds = items.map((i) => i.productId)
  const products = productIds.length > 0
    ? await tx.product.findManyByIds(productIds)
    : []

  const productMap = new Map(products.map((p) => [p.id, p]))
  for (const item of items) {
    const product = productMap.get(item.productId)
    if (!product) fail('PRODUCT_NOT_FOUND')
  }

  // ── 6. Compute totals ──
  // Locked lines (non-product) — preserved from before snapshot
  const oldLockedLines = invoice.items.filter(
    (i) => !i.productId || !['PRODUCT', 'SERVICE'].includes(i.type)
  )

  let lockedSubtotal = 0
  let lockedTotal = 0
  for (const line of oldLockedLines) {
    lockedSubtotal += line.subtotal
    lockedTotal += line.total
  }

  let productSubtotal = 0
  const newProductLines: Array<{
    productId: string
    description: string
    type: 'PRODUCT' | 'SERVICE'
    quantity: number
    unitPrice: number
    subtotal: number
  }> = []

  for (const item of items) {
    const product = productMap.get(item.productId)!
    const unitPrice = product.price
    const subtotal = item.quantity * unitPrice
    productSubtotal += subtotal
    newProductLines.push({
      productId: product.id,
      description: product.name,
      type: product.type,
      quantity: item.quantity,
      unitPrice,
      subtotal,
    })
  }

  const newSubtotal = lockedSubtotal + productSubtotal
  const newDiscountTotal = invoice.discountTotal
  const newGrandTotal = lockedTotal + productSubtotal

  // ── 7. Create new items ──
  // Locked lines — copy verbatim
  for (const line of oldLockedLines) {
    await tx.billing.createInvoiceItem({
      invoiceId,
      type: line.type,
      productId: line.productId,
      description: line.description,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      subtotal: line.subtotal,
      discountAmount: line.discountAmount,
      total: line.total,
      metadata: line.metadata as unknown as Prisma.InputJsonValue,
    })
  }

  // New product lines + apply stock
  let appliedStockQty = 0
  for (const line of newProductLines) {
    const createdItem = await tx.billing.createInvoiceItem({
      invoiceId,
      type: line.type,
      productId: line.productId,
      description: line.description,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      subtotal: line.subtotal,
      discountAmount: 0,
      total: line.subtotal,
    })

    // ── 8. Apply stock (PRODUCT only) ──
    if (line.type === 'PRODUCT') {
      const stockResult = await tx.product.decrementStockIfAvailable(line.productId, line.quantity)
      if (stockResult.count === 0) {
        const product = productMap.get(line.productId)
        fail('INSUFFICIENT_STOCK', product?.name ?? line.productId)
      }

      await tx.product.recordSaleMovement({
        productId: line.productId,
        invoiceItemId: createdItem.id,
        shiftId: invoice.shiftId,
        staffId,
        quantity: line.quantity,
        reason: `Sửa hoá đơn ${invoice.invoiceNo}`,
      })
      appliedStockQty += line.quantity
    }
  }

  // ── 9. Create new payment ──
  await tx.billing.createPayment({
    invoiceId,
    shiftId: invoice.shiftId,
    staffId,
    // Payment.totalHours required — invoice PAID luôn có payment gốc để copy giờ chơi
    totalHours: oldPayment?.totalHours ?? 0,
    subtotal: newSubtotal,
    discountTotal: newDiscountTotal,
    grandTotal: newGrandTotal,
    paymentMethod,
    paidAt: invoice.paidAt ?? new Date(),
  })

  // ── 10. Update invoice totals + notes ──
  const editNote = `\n\nSửa bởi ${actorName} (${timestamp})`
  const newNotes =
    notes !== undefined && notes !== null
      ? notes
        ? `${notes}${editNote}`
        : (invoice.notes ?? '') + editNote
      : (invoice.notes ?? '') + editNote

  await tx.billing.updateInvoiceFinancials(invoiceId, {
    subtotal: newSubtotal,
    discountTotal: newDiscountTotal,
    grandTotal: newGrandTotal,
    notes: newNotes,
  })

  // ── 11. Customer delta ──
  if (invoice.customerId) {
    await tx.customer.addSpend(invoice.customerId, newGrandTotal - oldGrandTotal)
  }

  // ── 12. Audit ──
  await tx.audit.append({
    userId: staffId,
    action: 'INVOICE_EDIT',
    entityType: 'Invoice',
    entityId: invoiceId,
    details: {
      invoiceNo: invoice.invoiceNo,
      before: beforeSnapshot,
      after: {
        status: 'PAID',
        subtotal: newSubtotal,
        discountTotal: newDiscountTotal,
        grandTotal: newGrandTotal,
        paymentMethod,
        notes: newNotes,
        items: [
          ...oldLockedLines.map((i) => ({
            type: i.type,
            description: i.description,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            subtotal: i.subtotal,
            total: i.total,
          })),
          ...newProductLines.map((l) => ({
            type: l.type,
            description: l.description,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            subtotal: l.subtotal,
            total: l.subtotal,
          })),
        ],
      },
      reversedStockQuantity: reversedStockQty,
      appliedStockQuantity: appliedStockQty,
      actorName,
    },
  })

  return {
    invoiceId,
    invoiceNo: invoice.invoiceNo,
    grandTotal: newGrandTotal,
  }
}

export function mapEditInvoiceError(error: DomainError): HttpErrorInfo {
  switch (error.code) {
    case 'INVOICE_NOT_FOUND':
      return { code: 'INVOICE_NOT_FOUND', message: 'Không tìm thấy hoá đơn', status: 404 }
    case 'INVOICE_NOT_EDITABLE':
      return {
        code: 'INVOICE_NOT_EDITABLE',
        message: 'Chỉ có thể sửa hoá đơn đã thanh toán',
        status: 409,
      }
    case 'SHIFT_CLOSED':
      return {
        code: 'SHIFT_CLOSED',
        message: 'Ca làm đã đóng, không thể sửa hoá đơn',
        status: 409,
      }
    case 'INVOICE_HAS_MEMBERSHIP':
      return {
        code: 'INVOICE_HAS_MEMBERSHIP',
        message: 'Hoá đơn có phí hội viên — vui lòng dùng chức năng huỷ hoá đơn',
        status: 409,
      }
    case 'INSUFFICIENT_STOCK':
      return {
        code: 'INSUFFICIENT_STOCK',
        message: `${error.detail ?? 'Sản phẩm'} không đủ tồn kho`,
        status: 400,
      }
    case 'PRODUCT_NOT_FOUND':
      return {
        code: 'PRODUCT_NOT_FOUND',
        message: 'Sản phẩm không tồn tại hoặc đã ngừng bán',
        status: 400,
      }
    default:
      return { code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 }
  }
}
