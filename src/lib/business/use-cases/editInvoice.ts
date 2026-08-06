import { logActivity } from '@/lib/business/audit'
import { prisma } from '@/lib/prisma'
import type { PaymentMethod } from '@/types'

// ── Input / Output ──────────────────────────────────────

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

// ── Helpers ─────────────────────────────────────────────

function toNumber(value: unknown): number {
  return Number(value ?? 0)
}

// ── Main (in-place edit) ────────────────────────────────

export async function editInvoice({
  invoiceId,
  staffId,
  items,
  paymentMethod,
  notes,
}: EditInvoiceInput): Promise<EditInvoiceResult> {
  return prisma.$transaction(async (tx) => {
    // ── 1. Read + guard ──
    const invoice = await tx.invoice.findUnique({
      where: { id: invoiceId },
      select: {
        id: true,
        invoiceNo: true,
        status: true,
        shiftId: true,
        customerId: true,
        sessionId: true,
        paidAt: true,
        notes: true,
        subtotal: true,
        discountTotal: true,
        grandTotal: true,
        staff: { select: { fullName: true } },
        items: {
          select: {
            id: true,
            type: true,
            productId: true,
            description: true,
            quantity: true,
            unitPrice: true,
            subtotal: true,
            discountAmount: true,
            total: true,
            metadata: true,
            stockMovements: {
              where: { type: 'SALE' },
              select: {
                id: true,
                productId: true,
                quantity: true,
                unitCost: true,
              },
            },
          },
        },
        payments: {
          select: { id: true, totalHours: true, paymentMethod: true },
        },
        membershipPayments: { select: { id: true } },
      },
    })

    if (!invoice) throw new Error('INVOICE_NOT_FOUND')
    if (invoice.status !== 'PAID') throw new Error('INVOICE_NOT_EDITABLE')
    if (!invoice.shiftId) throw new Error('SHIFT_CLOSED')
    if (invoice.membershipPayments.length > 0)
      throw new Error('INVOICE_HAS_MEMBERSHIP')

    const actorName = invoice.staff?.fullName ?? staffId
    const timestamp = new Date().toISOString()
    const oldGrandTotal = toNumber(invoice.grandTotal)
    const oldPayment = invoice.payments[0]
    let reversedStockQty = 0

    // ── Snapshot BEFORE (cho audit) ──
    const beforeSnapshot = {
      status: invoice.status,
      subtotal: toNumber(invoice.subtotal),
      discountTotal: toNumber(invoice.discountTotal),
      grandTotal: oldGrandTotal,
      paymentMethod: oldPayment?.paymentMethod ?? null,
      notes: invoice.notes,
      items: invoice.items.map((i) => ({
        type: i.type,
        description: i.description,
        quantity: toNumber(i.quantity),
        unitPrice: toNumber(i.unitPrice),
        subtotal: toNumber(i.subtotal),
        total: toNumber(i.total),
      })),
    }

    // ── 2. Reverse stock (own items) ──
    for (const item of invoice.items) {
      if (!item.productId) continue
      for (const movement of item.stockMovements) {
        const returnQty = Math.abs(toNumber(movement.quantity))
        await tx.product.update({
          where: { id: movement.productId ?? item.productId },
          data: { stockQuantity: { increment: returnQty } },
        })
        await tx.stockMovement.create({
          data: {
            productId: movement.productId ?? item.productId,
            invoiceItemId: item.id,
            shiftId: invoice.shiftId!,
            staffId,
            type: 'VOID',
            quantity: returnQty,
            unitCost: movement.unitCost ?? null,
            reason: `Sửa hoá đơn ${invoice.invoiceNo} bởi ${actorName}`,
          },
        })
        reversedStockQty += returnQty
      }
    }

    // ── 3. Reverse stock (merged DRAFT invoices) ──
    if (invoice.sessionId) {
      const mergedDrafts = await tx.invoice.findMany({
        where: {
          sessionId: invoice.sessionId,
          status: 'CANCELLED',
          notes: { contains: `Đã gộp vào hóa đơn ${invoice.invoiceNo}` },
        },
        include: {
          items: {
            include: {
              stockMovements: {
                where: { type: 'SALE' },
                select: { id: true, productId: true, quantity: true, unitCost: true },
              },
            },
          },
        },
      })

      for (const draft of mergedDrafts) {
        for (const item of draft.items) {
          if (!item.productId) continue
          for (const movement of item.stockMovements) {
            const returnQty = Math.abs(toNumber(movement.quantity))
            await tx.product.update({
              where: { id: movement.productId ?? item.productId },
              data: { stockQuantity: { increment: returnQty } },
            })
            await tx.stockMovement.create({
              data: {
                productId: movement.productId ?? item.productId,
                invoiceItemId: item.id,
                shiftId: invoice.shiftId!,
                staffId,
                type: 'VOID',
                quantity: returnQty,
                unitCost: movement.unitCost ?? null,
                reason: `Sửa hoá đơn gộp ${invoice.invoiceNo} bởi ${actorName}`,
              },
            })
            reversedStockQty += returnQty
          }
        }
      }
    }

    // ── 4. Delete old items + payment ──
    await tx.invoiceItem.deleteMany({ where: { invoiceId } })
    await tx.payment.deleteMany({ where: { invoiceId } })

    // ── 5. Validate + price new lines ──
    const productIds = items.map((i) => i.productId)
    const products =
      productIds.length > 0
        ? await tx.product.findMany({
            where: { id: { in: productIds }, isActive: true },
            select: { id: true, name: true, price: true, type: true, stockQuantity: true },
          })
        : []

    const productMap = new Map(products.map((p) => [p.id, p]))
    for (const item of items) {
      const product = productMap.get(item.productId)
      if (!product) throw new Error('PRODUCT_NOT_FOUND')
    }

    // ── 6. Compute totals ──
    // Locked lines (non-product) — preserved from before snapshot
    const oldLockedLines = invoice.items.filter(
      (i) => !i.productId || !['PRODUCT', 'SERVICE'].includes(i.type)
    )

    let lockedSubtotal = 0
    let lockedTotal = 0
    for (const line of oldLockedLines) {
      lockedSubtotal += toNumber(line.subtotal)
      lockedTotal += toNumber(line.total)
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
      const unitPrice = toNumber(product.price)
      const subtotal = item.quantity * unitPrice
      productSubtotal += subtotal
      newProductLines.push({
        productId: product.id,
        description: product.name,
        type: product.type as 'PRODUCT' | 'SERVICE',
        quantity: item.quantity,
        unitPrice,
        subtotal,
      })
    }

    const newSubtotal = lockedSubtotal + productSubtotal
    const newDiscountTotal = toNumber(invoice.discountTotal)
    const newGrandTotal = lockedTotal + productSubtotal

    // ── 7. Create new items ──
    // Locked lines — copy verbatim
    for (const line of oldLockedLines) {
      await tx.invoiceItem.create({
        data: {
          invoiceId,
          type: line.type,
          productId: line.productId,
          description: line.description,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          subtotal: line.subtotal,
          discountAmount: line.discountAmount,
          total: line.total,
          metadata: line.metadata as any,
        },
      })
    }

    // New product lines + apply stock
    let appliedStockQty = 0
    for (const line of newProductLines) {
      const createdItem = await tx.invoiceItem.create({
        data: {
          invoiceId,
          type: line.type,
          productId: line.productId,
          description: line.description,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          subtotal: line.subtotal,
          discountAmount: 0,
          total: line.subtotal,
        },
      })

      // ── 8. Apply stock (PRODUCT only) ──
      if (line.type === 'PRODUCT') {
        const stockResult = await tx.product.updateMany({
          where: { id: line.productId, stockQuantity: { gte: line.quantity } },
          data: { stockQuantity: { decrement: line.quantity } },
        })
        if (stockResult.count === 0) {
          const product = productMap.get(line.productId)
          throw new Error(`INSUFFICIENT_STOCK:${product?.name ?? line.productId}`)
        }

        const latestProduct = await tx.product.findUnique({
          where: { id: line.productId },
          select: { costPrice: true },
        })

        await tx.stockMovement.create({
          data: {
            productId: line.productId,
            invoiceItemId: createdItem.id,
            shiftId: invoice.shiftId!,
            staffId,
            type: 'SALE',
            quantity: -line.quantity,
            unitCost: latestProduct?.costPrice ?? null,
            reason: `Sửa hoá đơn ${invoice.invoiceNo}`,
          },
        })
        appliedStockQty += line.quantity
      }
    }

    // ── 9. Create new payment ──
    await tx.payment.create({
      data: {
        invoiceId,
        shiftId: invoice.shiftId!,
        staffId,
        totalHours: oldPayment?.totalHours ?? null,
        subtotal: newSubtotal,
        discountTotal: newDiscountTotal,
        grandTotal: newGrandTotal,
        paymentMethod,
        paidAt: invoice.paidAt ?? new Date(),
      },
    })

    // ── 10. Update invoice totals + notes ──
    const editNote = `\n\nSửa bởi ${actorName} (${timestamp})`
    const newNotes =
      notes !== undefined && notes !== null
        ? notes
          ? `${notes}${editNote}`
          : (invoice.notes ?? '') + editNote
        : (invoice.notes ?? '') + editNote

    await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        subtotal: newSubtotal,
        discountTotal: newDiscountTotal,
        grandTotal: newGrandTotal,
        notes: newNotes,
      },
    })

    // ── 11. Customer delta ──
    if (invoice.customerId) {
      await tx.customer.update({
        where: { id: invoice.customerId },
        data: { totalSpent: { increment: newGrandTotal - oldGrandTotal } },
      })
    }

    // ── 12. Audit ──
    await logActivity(tx, {
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
              quantity: toNumber(i.quantity),
              unitPrice: toNumber(i.unitPrice),
              subtotal: toNumber(i.subtotal),
              total: toNumber(i.total),
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
  })
}

// ── Error mapping ───────────────────────────────────────

export function mapEditInvoiceError(
  error: Error
): { code: string; message: string; status: number } {
  const message = error.message

  if (message === 'INVOICE_NOT_FOUND') {
    return { code: 'INVOICE_NOT_FOUND', message: 'Không tìm thấy hoá đơn', status: 404 }
  }
  if (message === 'INVOICE_NOT_EDITABLE') {
    return {
      code: 'INVOICE_NOT_EDITABLE',
      message: 'Chỉ có thể sửa hoá đơn đã thanh toán',
      status: 409,
    }
  }
  if (message === 'SHIFT_CLOSED') {
    return {
      code: 'SHIFT_CLOSED',
      message: 'Ca làm đã đóng, không thể sửa hoá đơn',
      status: 409,
    }
  }
  if (message === 'INVOICE_HAS_MEMBERSHIP') {
    return {
      code: 'INVOICE_HAS_MEMBERSHIP',
      message: 'Hoá đơn có phí hội viên — vui lòng dùng chức năng huỷ hoá đơn',
      status: 409,
    }
  }
  if (message.startsWith('INSUFFICIENT_STOCK:')) {
    return {
      code: 'INSUFFICIENT_STOCK',
      message: `${message.replace('INSUFFICIENT_STOCK:', '')} không đủ tồn kho`,
      status: 400,
    }
  }
  if (message === 'PRODUCT_NOT_FOUND') {
    return {
      code: 'PRODUCT_NOT_FOUND',
      message: 'Sản phẩm không tồn tại hoặc đã ngừng bán',
      status: 400,
    }
  }

  return { code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 }
}
