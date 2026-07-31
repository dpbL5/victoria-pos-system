import { logActivity } from '@/lib/business/audit'
import { findActiveMembership } from '@/lib/business/memberships'
import {
  findAvailablePromotionById,
  promotionRuleWhere,
  toPromotionSnapshot,
} from '@/lib/business/promotions'
import { getNumericSetting, SETTING_KEYS } from '@/lib/business/settings'
import { findOpenShiftForStaff } from '@/lib/business/shifts'
import { prisma } from '@/lib/prisma'
import {
  calculatePlayPrice,
  toPromotionMetadata,
  type PromotionSnapshot,
} from '@/lib/promotion-calculation'
import { calculateSessionPrice } from '@/lib/pricing'
import { generateInvoiceNo } from '@/lib/business/invoices'
import type { PaymentMethod } from '@/types'

export interface CheckoutLineInput {
  productId: string
  quantity: number
}

export interface CheckoutInput {
  sessionId: string
  staffId: string
  paymentMethod: PaymentMethod
  promotionRuleId?: string
  endTime?: Date
  items: CheckoutLineInput[]
  notes?: string
  /** ID của pricing group cần checkout (nếu không có, dùng legacy session.playerCount) */
  pricingGroupId?: string
  /** Số người checkout từ group */
  playerCount?: number
  /** Số lượng xe gửi (phí gửi xe) */
  parkingVehicleCount?: number
}

export interface CheckoutResult {
  sessionId: string
  invoiceId: string
  invoiceNo: string
  customerName: string
  startTime: Date
  endTime: Date
  totalHours: number
  hourlyRate: number
  subtotal: number
  playSubtotal: number
  productSubtotal: number
  promotionDiscount: number
  grandTotal: number
  isMemberSession: boolean
  promotion: PromotionSnapshot | null
  paymentMethod: PaymentMethod
  paymentId: string
  checkedOutPlayers: number
  remainingPlayers: number
  sessionClosed: boolean
  /** Tổng phí gửi xe (nếu có) */
  parkingFeeTotal?: number
}

interface CheckoutLine {
  productId: string
  type: 'PRODUCT' | 'SERVICE'
  description: string
  quantity: number
  unitPrice: number
  subtotal: number
}

export async function checkOut({
  sessionId,
  staffId,
  paymentMethod,
  promotionRuleId,
  endTime = new Date(),
  items,
  notes,
  pricingGroupId,
  playerCount,
  parkingVehicleCount = 0,
}: CheckoutInput): Promise<CheckoutResult> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      customer: true,
      membership: true,
      pricingGroups: { orderBy: { createdAt: 'asc' } },
    },
  })

  if (!session) {
    throw new Error('SESSION_NOT_FOUND')
  }
  if (session.status !== 'ACTIVE') {
    throw new Error(session.status === 'COMPLETED' ? 'SESSION_COMPLETED' : 'SESSION_CANCELLED')
  }
  if (endTime < session.startTime) {
    throw new Error('END_TIME_BEFORE_START')
  }

  // ── Xác định group và số người checkout ──
  let checkoutCount: number
  let targetGroupId: string | undefined

  if (pricingGroupId) {
    // Checkout theo pricing group cụ thể
    const group = session.pricingGroups.find(g => g.id === pricingGroupId)
    if (!group) throw new Error('PRICING_GROUP_NOT_FOUND')
    if (group.remainingCount <= 0) throw new Error('PRICING_GROUP_EMPTY')
    checkoutCount = Math.min(
      playerCount ?? group.remainingCount,
      group.remainingCount
    )
    if (checkoutCount <= 0) throw new Error('NO_PLAYERS_TO_CHECKOUT')
    targetGroupId = group.id
  } else {
    // Legacy path: dùng session.playerCount
    if (session.pricingGroups.length > 0) {
      // Session mới có groups, checkout từ group đầu tiên còn người
      const firstGroup = session.pricingGroups.find(g => g.remainingCount > 0)
      if (!firstGroup) throw new Error('NO_PLAYERS_TO_CHECKOUT')
      checkoutCount = Math.min(
        playerCount ?? firstGroup.remainingCount,
        firstGroup.remainingCount
      )
      if (checkoutCount <= 0) throw new Error('NO_PLAYERS_TO_CHECKOUT')
      targetGroupId = firstGroup.id
    } else {
      // Session cũ không có groups (legacy)
      checkoutCount = Math.min(
        playerCount ?? session.playerCount,
        session.playerCount
      )
      if (checkoutCount <= 0) throw new Error('NO_PLAYERS_TO_CHECKOUT')
    }
  }

  const checkoutAt = new Date()
  const selectedPromotion = promotionRuleId
    ? await findAvailablePromotionById(promotionRuleId, checkoutAt)
    : null

  if (promotionRuleId && !selectedPromotion) {
    throw new Error('PROMOTION_UNAVAILABLE')
  }

  const pricing = await calculateSessionPrice(sessionId, endTime, selectedPromotion, targetGroupId)
  if (pricing.isMemberSession && promotionRuleId) {
    throw new Error('PROMOTION_NOT_APPLICABLE')
  }

  let finalPricing = pricing
  let playDiscountTotal = pricing.promotionDiscount
  let playTotal = Math.max(0, pricing.grandTotal)

  const quantityByProductId = new Map<string, number>()
  const newQuantityByProductId = new Map<string, number>()

  // ── Gom sản phẩm từ hóa đơn DRAFT (bán kèm — đã trừ kho lúc thêm vào phiên) ──
  const draftInvoices = await prisma.invoice.findMany({
    where: { sessionId, status: 'DRAFT' },
    include: {
      items: {
        where: { productId: { not: null } },
        select: { productId: true, quantity: true },
      },
    },
  })

  const draftInvoiceIds: string[] = []
  for (const draft of draftInvoices) {
    draftInvoiceIds.push(draft.id)
    for (const item of draft.items) {
      if (item.productId) {
        quantityByProductId.set(
          item.productId,
          (quantityByProductId.get(item.productId) ?? 0) + Number(item.quantity)
        )
      }
    }
  }

  // ── Gom sản phẩm từ request checkout hiện tại (cần trừ kho) ──
  for (const item of items) {
    quantityByProductId.set(
      item.productId,
      (quantityByProductId.get(item.productId) ?? 0) + item.quantity
    )
    newQuantityByProductId.set(
      item.productId,
      (newQuantityByProductId.get(item.productId) ?? 0) + item.quantity
    )
  }

  const productIds = Array.from(quantityByProductId.keys())
  const products = productIds.length > 0
    ? await prisma.product.findMany({
        where: { id: { in: productIds }, isActive: true },
        select: {
          id: true,
          name: true,
          type: true,
          price: true,
          costPrice: true,
          stockQuantity: true,
          isActive: true,
        },
      })
    : []

  if (products.length !== productIds.length) {
    throw new Error('PRODUCT_NOT_FOUND')
  }

  const checkoutLines: CheckoutLine[] = products.map((product) => {
    const quantity = quantityByProductId.get(product.id) ?? 0
    const unitPrice = Number(product.price)
    return {
      productId: product.id,
      type: product.type,
      description: product.name,
      quantity,
      unitPrice,
      subtotal: quantity * unitPrice,
    }
  })

  const productSubtotal = checkoutLines.reduce((sum, line) => sum + line.subtotal, 0)

  // ── Nhân tiền giờ chơi với số người checkout ──
  const perPersonSubtotal = pricing.subtotal
  const perPersonDiscount = pricing.promotionDiscount
  const perPersonTotal = playTotal
  const multipliedSubtotal = perPersonSubtotal * checkoutCount
  const multipliedDiscount = perPersonDiscount * checkoutCount
  const multipliedPlayTotal = perPersonTotal * checkoutCount

  let invoiceSubtotal = multipliedSubtotal + productSubtotal
  let invoiceGrandTotal = multipliedPlayTotal + productSubtotal
  const paidAt = checkoutAt

  const result = await prisma.$transaction(async (tx) => {
    const openShift = await findOpenShiftForStaff(tx, staffId)
    if (!openShift) {
      throw new Error('SHIFT_REQUIRED')
    }

    const shiftId = openShift.id

    // ── Re-validate membership trong transaction (TOCTOU guard) ──
    if (pricing.isMemberSession) {
      const activeNow = await findActiveMembership(tx, session.customerId, new Date())
      if (!activeNow) {
        throw new Error('MEMBERSHIP_EXPIRED_DURING_CHECKOUT')
      }
    }

    const promotionRule = promotionRuleId
      ? await tx.promotionRule.findFirst({
          where: {
            id: promotionRuleId,
            ...promotionRuleWhere(checkoutAt),
          },
        })
      : null

    if (promotionRuleId && !promotionRule) {
      throw new Error('PROMOTION_UNAVAILABLE')
    }

    const promotion = promotionRule ? toPromotionSnapshot(promotionRule) : null
    const playPrice = calculatePlayPrice({
      totalHours: pricing.totalHours,
      hourlyRate: pricing.hourlyRate,
      promotion,
      subtotal: pricing.subtotal,
    })
    finalPricing = {
      ...pricing,
      subtotal: playPrice.subtotal,
      promotionDiscount: playPrice.promotionDiscount,
      grandTotal: playPrice.grandTotal,
      promotion,
    }
    playDiscountTotal = finalPricing.promotionDiscount * checkoutCount
    playTotal = Math.max(0, finalPricing.grandTotal) * checkoutCount
    invoiceSubtotal = finalPricing.subtotal * checkoutCount + productSubtotal
    invoiceGrandTotal = playTotal + productSubtotal

    // ── Lấy group label ──
    const groupLabel = targetGroupId
      ? session.pricingGroups.find(g => g.id === targetGroupId)?.label ?? ''
      : ''

    const invoice = await tx.invoice.create({
      data: {
        invoiceNo: generateInvoiceNo(),
        customerId: session.customerId,
        sessionId,
        shiftId,
        staffId,
        status: 'PAID',
        subtotal: invoiceSubtotal,
        discountTotal: playDiscountTotal,
        grandTotal: invoiceGrandTotal,
        paidAt,
        notes: notes || (
          targetGroupId
            ? `Checkout ${checkoutCount} người (${groupLabel})`
            : (checkoutCount < session.playerCount ? `Checkout ${checkoutCount}/${session.playerCount} người` : undefined)
        ),
      },
    })

    // PLAY_TIME item: quantity là tổng person-hours
    await tx.invoiceItem.create({
      data: {
        invoiceId: invoice.id,
        type: 'PLAY_TIME',
        description: finalPricing.isMemberSession
          ? `Giờ chơi hội viên × ${checkoutCount} người`
          : targetGroupId
            ? `Giờ chơi (${groupLabel}: ${checkoutCount} người × ${moneyPerPerson(finalPricing.hourlyRate)})`
            : `Giờ chơi khách vãng lai × ${checkoutCount} người`,
        quantity: +(finalPricing.totalHours * checkoutCount).toFixed(2),
        unitPrice: finalPricing.hourlyRate,
        subtotal: finalPricing.subtotal * checkoutCount,
        discountAmount: playDiscountTotal,
        total: playTotal,
        metadata: {
          sessionId,
          customerType: session.customer.type,
          membershipId: session.membershipId,
          isMemberSession: finalPricing.isMemberSession,
          promotion: toPromotionMetadata(finalPricing.promotion),
          playSubtotal: finalPricing.subtotal,
          playTotal,
          checkoutCount,
          perPersonSubtotal: finalPricing.subtotal,
          perPersonHours: finalPricing.totalHours,
          pricingGroupId: targetGroupId ?? null,
          groupLabel: groupLabel || null,
        },
      },
    })

    // ── Phí gửi xe (trừ vào tổng thanh toán) ──
    let parkingFeeTotal = 0
    if (parkingVehicleCount > 0) {
      const unitPrice = await getNumericSetting(SETTING_KEYS.PARKING_FEE_UNIT_PRICE, 0)
      if (unitPrice > 0) {
        parkingFeeTotal = parkingVehicleCount * unitPrice
        invoiceSubtotal -= parkingFeeTotal
        invoiceGrandTotal = Math.max(0, invoiceGrandTotal - parkingFeeTotal)

        await tx.invoiceItem.create({
          data: {
            invoiceId: invoice.id,
            type: 'SURCHARGE',
            description: `Phí gửi xe × ${parkingVehicleCount} xe`,
            quantity: parkingVehicleCount,
            unitPrice,
            subtotal: -parkingFeeTotal,
            discountAmount: 0,
            total: -parkingFeeTotal,
            metadata: {
              surchargeType: 'PARKING',
              vehicleCount: parkingVehicleCount,
              unitPrice,
            },
          },
        })

        await tx.invoice.update({
          where: { id: invoice.id },
          data: {
            subtotal: invoiceSubtotal,
            grandTotal: invoiceGrandTotal,
          },
        })
      }
    }

    for (const line of checkoutLines) {
      const latestProduct = await tx.product.findUnique({
        where: { id: line.productId },
        select: {
          id: true,
          name: true,
          type: true,
          price: true,
          costPrice: true,
          stockQuantity: true,
          isActive: true,
        },
      })

      if (!latestProduct || !latestProduct.isActive) {
        throw new Error('PRODUCT_UNAVAILABLE')
      }

      const invoiceItem = await tx.invoiceItem.create({
        data: {
          invoiceId: invoice.id,
          productId: latestProduct.id,
          type: latestProduct.type,
          description: latestProduct.name,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          subtotal: line.subtotal,
          discountAmount: 0,
          total: line.subtotal,
        },
      })

      const newQuantity = newQuantityByProductId.get(line.productId) ?? 0
      if (latestProduct.type === 'PRODUCT' && newQuantity > 0) {
        const stockUpdate = await tx.product.updateMany({
          where: {
            id: latestProduct.id,
            stockQuantity: { gte: newQuantity },
          },
          data: {
            stockQuantity: { decrement: newQuantity },
          },
        })

        if (stockUpdate.count === 0) {
          throw new Error(`INSUFFICIENT_STOCK:${latestProduct.name}`)
        }

        await tx.stockMovement.create({
          data: {
            productId: latestProduct.id,
            invoiceItemId: invoiceItem.id,
            shiftId,
            staffId,
            type: 'SALE',
            quantity: -newQuantity,
            unitCost: latestProduct.costPrice,
            reason: `Bán kèm phiên ${sessionId}`,
          },
        })
      }
    }

    const payment = await tx.payment.create({
      data: {
        sessionId,
        invoiceId: invoice.id,
        shiftId,
        staffId,
        totalHours: finalPricing.totalHours,
        subtotal: invoiceSubtotal,
        discountTotal: playDiscountTotal,
        grandTotal: invoiceGrandTotal,
        paymentMethod,
        paidAt,
        notes,
      },
    })

    // ── Cập nhật group, kiểm tra còn người không ──
    let totalRemaining = 0

    if (targetGroupId) {
      // Decrement group.remainingCount
      const updatedGroup = await tx.sessionPricingGroup.update({
        where: { id: targetGroupId },
        data: { remainingCount: { decrement: checkoutCount } },
      })
      if (updatedGroup.remainingCount < 0) {
        throw new Error('PRICING_GROUP_UNDERFLOW')
      }

      // Tính tổng remaining từ tất cả groups
      const allGroups = await tx.sessionPricingGroup.findMany({
        where: { sessionId },
        select: { remainingCount: true },
      })
      totalRemaining = allGroups.reduce((sum, g) => sum + g.remainingCount, 0)
    } else {
      // Legacy path: dùng session.playerCount
      totalRemaining = session.playerCount - checkoutCount
    }

    const isFullCheckout = totalRemaining <= 0

    if (isFullCheckout) {
      await tx.session.update({
        where: { id: sessionId },
        data: {
          shiftId,
          endTime,
          status: 'COMPLETED',
          playerCount: 0,
          totalHours: finalPricing.totalHours,
          subtotal: finalPricing.subtotal,
          promotionRuleId: finalPricing.promotion?.ruleId,
          promotionName: finalPricing.promotion?.name,
          promotionDiscountType: finalPricing.promotion?.discountType,
          promotionDiscountValue: finalPricing.promotion?.discountValue,
          discountAmount: playDiscountTotal,
          totalAmount: invoiceGrandTotal,
        },
      })
    } else if (!targetGroupId) {
      // Legacy partial checkout
      await tx.session.update({
        where: { id: sessionId },
        data: {
          playerCount: totalRemaining,
        },
      })
    }

    // Cập nhật customer totals
    await tx.customer.update({
      where: { id: session.customerId },
      data: {
        totalHoursPlayed: { increment: +(finalPricing.totalHours * checkoutCount).toFixed(2) },
        totalSpent: { increment: invoiceGrandTotal },
      },
    })

    // ── Chỉ huỷ hóa đơn DRAFT khi checkout toàn bộ phiên ──
    if (isFullCheckout && draftInvoiceIds.length > 0) {
      await tx.invoice.updateMany({
        where: { id: { in: draftInvoiceIds }, status: 'DRAFT' },
        data: {
          status: 'CANCELLED',
          notes: `Đã gộp vào hóa đơn ${invoice.invoiceNo}`,
        },
      })
    }

    await logActivity(tx, {
      userId: staffId,
      action: 'SESSION_CHECK_OUT',
      entityType: 'Session',
      entityId: sessionId,
      details: {
        invoiceId: invoice.id,
        paymentId: payment.id,
        shiftId: shiftId ?? null,
        grandTotal: invoiceGrandTotal,
        productSubtotal,
        isMemberSession: finalPricing.isMemberSession,
        playSubtotal: finalPricing.subtotal,
        promotionDiscount: playDiscountTotal,
        promotion: toPromotionMetadata(finalPricing.promotion),
        checkoutCount,
        remainingPlayers: totalRemaining,
        isFullCheckout,
        pricingGroupId: targetGroupId ?? null,
        mergedDraftInvoices: isFullCheckout && draftInvoiceIds.length > 0 ? draftInvoiceIds : undefined,
        parkingFeeTotal: parkingFeeTotal || undefined,
      },
    })

    return { invoice, payment, remainingPlayers: totalRemaining, parkingFeeTotal }
  })

  const isFullCheckout = result.remainingPlayers <= 0

  return {
    sessionId,
    invoiceId: result.invoice.id,
    invoiceNo: result.invoice.invoiceNo,
    customerName: session.customer.fullName,
    startTime: session.startTime,
    endTime,
    totalHours: finalPricing.totalHours,
    hourlyRate: finalPricing.hourlyRate,
    subtotal: invoiceSubtotal,
    playSubtotal: finalPricing.subtotal * checkoutCount,
    productSubtotal,
    promotionDiscount: playDiscountTotal,
    grandTotal: invoiceGrandTotal,
    isMemberSession: finalPricing.isMemberSession,
    promotion: finalPricing.promotion,
    paymentMethod,
    paymentId: result.payment.id,
    checkedOutPlayers: checkoutCount,
    remainingPlayers: result.remainingPlayers,
    sessionClosed: isFullCheckout,
    parkingFeeTotal: result.parkingFeeTotal,
  }
}

function moneyPerPerson(value: number): string {
  if (value >= 1000 && value % 1000 === 0) {
    return `${(value / 1000).toLocaleString('vi-VN')}kđ`
  }
  return `${value.toLocaleString('vi-VN')}đ`
}

export function mapCheckoutError(error: Error): { code: string; message: string; status: number } {
  const message = error.message

  if (message === 'SESSION_NOT_FOUND') {
    return { code: 'SESSION_NOT_FOUND', message: 'Không tìm thấy phiên', status: 404 }
  }
  if (message === 'SESSION_COMPLETED') {
    return { code: 'SESSION_COMPLETED', message: 'Phiên đã kết thúc rồi', status: 400 }
  }
  if (message === 'SESSION_CANCELLED') {
    return { code: 'SESSION_CANCELLED', message: 'Phiên đã bị hủy rồi', status: 400 }
  }
  if (message === 'END_TIME_BEFORE_START') {
    return { code: 'END_TIME_BEFORE_START', message: 'Thời gian checkout không được trước lúc check-in', status: 400 }
  }
  if (message === 'PRICING_GROUP_NOT_FOUND') {
    return { code: 'PRICING_GROUP_NOT_FOUND', message: 'Không tìm thấy nhóm giá', status: 400 }
  }
  if (message === 'PRICING_GROUP_EMPTY') {
    return { code: 'PRICING_GROUP_EMPTY', message: 'Nhóm giá đã checkout hết người', status: 400 }
  }
  if (message === 'PRODUCT_NOT_FOUND') {
    return { code: 'PRODUCT_NOT_FOUND', message: 'Có sản phẩm không tồn tại hoặc đã ngừng bán', status: 400 }
  }
  if (message === 'PRODUCT_UNAVAILABLE') {
    return { code: 'PRODUCT_UNAVAILABLE', message: 'Có sản phẩm không còn bán', status: 400 }
  }
  if (message.startsWith('INSUFFICIENT_STOCK:')) {
    return { code: 'INSUFFICIENT_STOCK', message: `${message.replace('INSUFFICIENT_STOCK:', '')} không đủ tồn kho`, status: 400 }
  }
  if (message === 'NO_PLAYERS_TO_CHECKOUT') {
    return { code: 'NO_PLAYERS_TO_CHECKOUT', message: 'Không còn người chơi nào để checkout', status: 400 }
  }
  if (message === 'SHIFT_REQUIRED') {
    return { code: 'SHIFT_REQUIRED', message: 'Cần mở hoặc tham gia ca trước khi checkout', status: 409 }
  }
  if (message === 'MEMBERSHIP_EXPIRED_DURING_CHECKOUT') {
    return { code: 'MEMBERSHIP_EXPIRED_DURING_CHECKOUT', message: 'Gói hội viên đã hết hạn trong lúc checkout. Vui lòng thử lại.', status: 409 }
  }
  if (message === 'PROMOTION_UNAVAILABLE') {
    return { code: 'PROMOTION_UNAVAILABLE', message: 'Khuyến mại không còn hiệu lực. Vui lòng chọn lại trước khi thu tiền.', status: 409 }
  }
  if (message === 'PROMOTION_NOT_APPLICABLE') {
    return { code: 'PROMOTION_NOT_APPLICABLE', message: 'Khuyến mại chỉ áp dụng cho tiền giờ chơi khách vãng lai.', status: 400 }
  }

  return { code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 }
}
