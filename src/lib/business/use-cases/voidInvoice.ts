import { logActivity } from '@/lib/business/audit'
import { prisma } from '@/lib/prisma'

export interface VoidInvoiceInput {
  invoiceId: string
  staffId: string
  reason?: string
}

/**
 * Huỷ (void) một hoá đơn đã thanh toán.
 *
 * 1. Hoàn trả tồn kho — tạo StockMovement VOID để đảo ngược các lần SALE.
 * 2. Đánh dấu hoá đơn thành CANCELLED.
 * 3. Ghi nhật ký kiểm toán.
 *
 * Không tạo payment hoàn trả, không hoàn số dư khách hàng.
 * Báo cáo doanh thu tự lọc các payment từ hoá đơn CANCELLED.
 */
export async function voidInvoice({
  invoiceId,
  staffId,
  reason,
}: VoidInvoiceInput): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findUnique({
      where: { id: invoiceId },
      select: {
        id: true,
        invoiceNo: true,
        grandTotal: true,
        status: true,
        notes: true,
        shiftId: true,
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
        staff: { select: { fullName: true } },
      },
    })

    if (!invoice) throw new Error('INVOICE_NOT_FOUND')
    if (invoice.status !== 'PAID') throw new Error('INVOICE_NOT_VOIDABLE')
    if (!invoice.shiftId) throw new Error('SHIFT_CLOSED')

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

    // 2. Đánh dấu hoá đơn là CANCELLED
    await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        status: 'CANCELLED',
        notes: invoice.notes
          ? `${invoice.notes}\n\n${note} (${timestamp})`
          : `${note} (${timestamp})`,
      },
    })

    // 3. Ghi nhật ký hoạt động
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
        reversedStockItems,
        reason: reason ?? null,
        shiftId: correctionShiftId,
        actorName,
      },
    })
  })
}
