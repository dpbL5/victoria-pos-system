import { logActivity } from '@/lib/business/audit'
import { prisma } from '@/lib/prisma'

export interface VoidInvoiceInput {
  invoiceId: string
  staffId: string
  reason?: string
}

export interface VoidInvoiceResult {
  invoiceNo: string
  grandTotal: number
  refundAmount: number
  reversedStockItems: number
  correction: boolean
}

/**
 * Huỷ (void) một hoá đơn đã thanh toán.
 *
 * Thay vì xoá cứng (mất dấu mốc kế toán), hàm này:
 * 1. Đánh dấu hoá đơn thành CANCELLED.
 * 2. Hoàn trả tồn kho — tạo StockMovement kiểu VOID (số lượng dương) để
 *    đảo ngược các lần bán (SALE) đã trừ kho.
 * 3. Tạo bản ghi Payment âm (refund) để cân bằng lại tiền ca và doanh thu.
 * 4. Hoàn lại số dư khách hàng (totalSpent, totalHoursPlayed) đã cộng khi checkout.
 * 5. Ghi nhật ký hoạt động (INVOICE_VOID).
 *
 * Áp dụng cho ca đang mở lẫn ca đã đóng:
 * - Ca đang mở: hoàn trả tiền về ngăn kéo bình thường.
 * - Ca đã đóng: đây là một điều chỉnh bản ghi (admin correction). Không sửa các
 *   trường tiền mặt đã đóng (expectedCash/actualCash); thay vào đó tạo Payment
 *   + StockMovement VOID gắn vào ca gốc và ghi rõ vào nhật ký kiểm toán.
 *
 * Toàn bộ trong một giao dịch để bảo toàn tính toàn vẹn dữ liệu.
 */
export async function voidInvoice({
  invoiceId,
  staffId,
  reason,
}: VoidInvoiceInput): Promise<VoidInvoiceResult> {
  return await prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        items: {
          select: {
            id: true,
            type: true,
            productId: true,
            quantity: true,
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
          select: { id: true, paymentMethod: true, grandTotal: true },
        },
        shift: { select: { id: true, status: true } },
        staff: { select: { fullName: true } },
      },
    })

    if (!invoice) throw new Error('INVOICE_NOT_FOUND')
    if (invoice.status !== 'PAID') throw new Error('INVOICE_NOT_VOIDABLE')

    // Ghi nhận hoàn trả/hoàn kho vào ca gốc của hoá đơn — dùng cho cả ca mở
    // và ca đã đóng (điều chỉnh bản ghi).
    if (!invoice.shiftId) throw new Error('SHIFT_CLOSED')
    const isClosedShift = invoice.shift?.status !== 'OPEN'
    const correctionShiftId = invoice.shiftId

    const actorName = invoice.staff?.fullName ?? staffId
    const note = reason
      ? `Huỷ hoá đơn ${invoice.invoiceNo} bởi ${actorName}: ${reason}`
      : `Huỷ hoá đơn ${invoice.invoiceNo} bởi ${actorName}`
    const timestamp = new Date().toISOString()

    // 1. Hoàn trả tồn kho cho hàng hoá đã bán (đảo ngược StockMovement SALE)
    let reversedStockItems = 0
    for (const item of invoice.items) {
      if (!item.productId) continue
      for (const movement of item.stockMovements) {
        const returnQty = Math.abs(Number(movement.quantity))
        await tx.product.update({
          where: { id: movement.productId ?? item.productId },
          data: { stockQuantity: { increment: returnQty } },
        })
        await tx.stockMovement.create({
          data: {
            productId: movement.productId ?? item.productId,
            invoiceItemId: item.id,
            shiftId: correctionShiftId,
            staffId,
            type: 'VOID',
            quantity: returnQty,
            unitCost: movement.unitCost ?? null,
            reason: note,
          },
        })
        reversedStockItems += returnQty
      }
    }

    // 2. Tạo payment hoàn trả (số âm) để cân bằng lại tiền ca và doanh thu
    const originalMethod = invoice.payments[0]?.paymentMethod ?? 'CASH'
    const refundAmount = -Number(invoice.grandTotal)
    await tx.payment.create({
      data: {
        sessionId: invoice.sessionId,
        invoiceId: invoiceId,
        shiftId: correctionShiftId,
        staffId,
        totalHours: 0,
        subtotal: 0,
        discountTotal: 0,
        grandTotal: refundAmount,
        paymentMethod: originalMethod,
        paidAt: new Date(),
        notes: note,
      },
    })

    // 3. Hoàn lại số dư khách hàng (tăng ở checkout → giảm tại đây)
    const playHours = invoice.items
      .filter((item) => item.type === 'PLAY_TIME')
      .reduce((sum, item) => sum + Number(item.quantity), 0)
    if (invoice.customerId) {
      await tx.customer.update({
        where: { id: invoice.customerId },
        data: {
          totalSpent: { decrement: Number(invoice.grandTotal) },
          totalHoursPlayed: { decrement: playHours },
        },
      })
    }

    // 4. Đánh dấu hoá đơn là CANCELLED
    await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        status: 'CANCELLED',
        notes: invoice.notes
          ? `${invoice.notes}\n\n${note} (${timestamp})`
          : `${note} (${timestamp})`,
      },
    })

    // 5. Ghi nhật ký hoạt động
    await logActivity(tx, {
      userId: staffId,
      action: 'INVOICE_VOID',
      entityType: 'Invoice',
      entityId: invoiceId,
      details: {
        invoiceNo: invoice.invoiceNo,
        statusBefore: invoice.status,
        statusAfter: 'CANCELLED',
        grandTotal: Number(invoice.grandTotal),
        refundAmount,
        refundPaymentMethod: originalMethod,
        reversedStockItems,
        playHoursReverted: playHours,
        reason: reason ?? null,
        shiftId: correctionShiftId,
        closedShiftCorrection: isClosedShift,
        actorName,
      },
    })

    return {
      invoiceNo: invoice.invoiceNo,
      grandTotal: Number(invoice.grandTotal),
      refundAmount,
      reversedStockItems,
      correction: isClosedShift,
    }
  })
}
