// ── Use-case: checkOut — thu tiền, đóng phiên, trừ kho ─────
import { err, ok } from '@/lib/shared/result'
import type { DomainError, Result } from '@/lib/shared/result'
import { fail, runInTransaction } from '@/lib/infrastructure/db-helpers'
import type { Repositories } from '@/lib/infrastructure/repositories'
import { repositories } from '@/lib/infrastructure/repositories'
import type { HttpErrorInfo } from '@/lib/infrastructure/api-helpers'
import {
  calculatePlayPrice,
  toPromotionMetadata,
  type PromotionSnapshot,
} from '@/lib/promotion-calculation'
import { calculateSessionPrice, type PricingResult } from '../pricing-engine'
import { generateInvoiceNo } from '@/lib/invoicing'
import { SETTING_KEYS } from '@/lib/settings'
import type { CheckoutPaymentMethod } from '@/types'
import type { SessionWithDetails } from '../ports'
import type { CheckoutLine } from './checkout-types'

export interface CheckoutLineInput {
  productId: string
  quantity: number
}

export interface CheckoutInput {
  sessionId: string
  staffId: string
  paymentMethod: CheckoutPaymentMethod
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
  paymentMethod: CheckoutPaymentMethod
  paymentId: string
  checkedOutPlayers: number
  remainingPlayers: number
  sessionClosed: boolean
  /** Tổng phí gửi xe (nếu có) */
  parkingFeeTotal?: number
}

/** Context đã tính trước transaction — truyền vào runCheckOutTx để test được */
export interface CheckoutContext {
  session: SessionWithDetails
  sessionId: string
  staffId: string
  paymentMethod: CheckoutPaymentMethod
  endTime: Date
  notes?: string
  checkoutCount: number
  targetGroupId?: string
  pricing: PricingResult
  checkoutLines: CheckoutLine[]
  productSubtotal: number
  draftInvoiceIds: string[]
  newQuantityByProductId: Map<string, number>
  parkingVehicleCount: number
  checkoutAt: Date
  customerId: string
}

export async function checkOut(
  input: CheckoutInput,
  deps: Repositories = repositories
): Promise<Result<CheckoutResult>> {
  const {
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
  } = input

  // ── Pha 1: Guard trước transaction ──
  const session = await deps.session.findByIdForCheckout(sessionId)
  if (!session) return err('SESSION_NOT_FOUND')
  if (session.status !== 'ACTIVE') {
    return err(session.status === 'COMPLETED' ? 'SESSION_COMPLETED' : 'SESSION_CANCELLED')
  }
  if (endTime < session.startTime) return err('END_TIME_BEFORE_START')

  // ── Xác định group và số người checkout ──
  let checkoutCount: number
  let targetGroupId: string | undefined

  if (pricingGroupId) {
    const group = session.pricingGroups.find(g => g.id === pricingGroupId)
    if (!group) return err('PRICING_GROUP_NOT_FOUND')
    if (group.remainingCount <= 0) return err('PRICING_GROUP_EMPTY')
    checkoutCount = Math.min(
      playerCount ?? group.remainingCount,
      group.remainingCount
    )
    if (checkoutCount <= 0) return err('NO_PLAYERS_TO_CHECKOUT')
    targetGroupId = group.id
  } else {
    // Legacy path: dùng session.playerCount
    if (session.pricingGroups.length > 0) {
      // Session mới có groups, checkout từ group đầu tiên còn người
      const firstGroup = session.pricingGroups.find(g => g.remainingCount > 0)
      if (!firstGroup) return err('NO_PLAYERS_TO_CHECKOUT')
      checkoutCount = Math.min(
        playerCount ?? firstGroup.remainingCount,
        firstGroup.remainingCount
      )
      if (checkoutCount <= 0) return err('NO_PLAYERS_TO_CHECKOUT')
      targetGroupId = firstGroup.id
    } else {
      // Session cũ không có groups (legacy)
      checkoutCount = Math.min(
        playerCount ?? session.playerCount,
        session.playerCount
      )
      if (checkoutCount <= 0) return err('NO_PLAYERS_TO_CHECKOUT')
    }
  }

  const checkoutAt = new Date()
  const selectedPromotion = promotionRuleId
    ? await deps.promotions.findAvailableById(promotionRuleId, checkoutAt)
    : null

  if (promotionRuleId && !selectedPromotion) {
    return err('PROMOTION_UNAVAILABLE')
  }

  const pricingResult = await calculateSessionPrice(deps, sessionId, endTime, selectedPromotion, targetGroupId)
  if (!pricingResult.ok) return pricingResult
  const pricing = pricingResult.value
  if (pricing.isMemberSession && promotionRuleId) {
    return err('PROMOTION_NOT_APPLICABLE')
  }

  let finalPricing = pricing
  let playDiscountTotal = pricing.promotionDiscount
  let playTotal = Math.max(0, pricing.grandTotal)

  const quantityByProductId = new Map<string, number>()
  const newQuantityByProductId = new Map<string, number>()

  // ── Gom sản phẩm từ hóa đơn DRAFT (bán kèm — đã trừ kho lúc thêm vào phiên) ──
  const draftInvoices = await deps.billing.findDraftInvoices(sessionId)
  const draftInvoiceIds: string[] = []
  for (const draft of draftInvoices) {
    draftInvoiceIds.push(draft.id)
    for (const item of draft.items) {
      if (item.productId) {
        quantityByProductId.set(
          item.productId,
          (quantityByProductId.get(item.productId) ?? 0) + item.quantity
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
    ? await deps.product.findManyByIds(productIds)
    : []

  if (products.length !== productIds.length) {
    return err('PRODUCT_NOT_FOUND')
  }

  const checkoutLines: CheckoutLine[] = products.map((product) => {
    const quantity = quantityByProductId.get(product.id) ?? 0
    const unitPrice = product.price
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
  const multipliedSubtotal = pricing.subtotal * checkoutCount
  const multipliedPlayTotal = playTotal * checkoutCount

  let invoiceSubtotal = multipliedSubtotal + productSubtotal
  let invoiceGrandTotal = multipliedPlayTotal + productSubtotal
  const paidAt = checkoutAt

  const ctx: CheckoutContext = {
    session,
    sessionId,
    staffId,
    paymentMethod,
    endTime,
    notes,
    checkoutCount,
    targetGroupId,
    pricing,
    checkoutLines,
    productSubtotal,
    draftInvoiceIds,
    newQuantityByProductId,
    parkingVehicleCount,
    checkoutAt,
    customerId: session.customerId,
  }

  const result = await runInTransaction((tx) =>
    runCheckOutTx(tx, ctx, {
      finalPricing,
      playDiscountTotal,
      playTotal,
      invoiceSubtotal,
      invoiceGrandTotal,
      paidAt,
      promotionRuleId,
    })
  )

  if (!result.ok) return result
  // Cập nhật mutable state từ tx (finalPricing / totals được tính lại trong tx)
  finalPricing = result.value.finalPricing
  playDiscountTotal = result.value.playDiscountTotal
  playTotal = result.value.playTotal
  invoiceSubtotal = result.value.invoiceSubtotal
  invoiceGrandTotal = result.value.invoiceGrandTotal

  const isFullCheckout = result.value.remainingPlayers <= 0

  return ok({
    sessionId,
    invoiceId: result.value.invoice.id,
    invoiceNo: result.value.invoice.invoiceNo,
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
    paymentId: result.value.payment.id,
    checkedOutPlayers: checkoutCount,
    remainingPlayers: result.value.remainingPlayers,
    sessionClosed: isFullCheckout,
    parkingFeeTotal: result.value.parkingFeeTotal,
  })
}

/** Mutable state tính lại bên trong transaction — truyền qua ref object */
export interface CheckoutTxState {
  finalPricing: PricingResult
  playDiscountTotal: number
  playTotal: number
  invoiceSubtotal: number
  invoiceGrandTotal: number
  paidAt: Date
  promotionRuleId?: string
}

export interface CheckoutTxResult {
  invoice: { id: string; invoiceNo: string }
  payment: { id: string }
  remainingPlayers: number
  parkingFeeTotal: number
  invoiceNo: string
  finalPricing: PricingResult
  playDiscountTotal: number
  playTotal: number
  invoiceSubtotal: number
  invoiceGrandTotal: number
}

/**
 * Thân transaction — tách riêng để unit test với fake repositories.
 * Lỗi validation trong tx dùng fail() → throw RollbackSignal → rollback.
 */
export async function runCheckOutTx(
  tx: Repositories,
  ctx: CheckoutContext,
  state: CheckoutTxState
): Promise<CheckoutTxResult> {
  const {
    session,
    sessionId,
    staffId,
    paymentMethod,
    endTime,
    notes,
    checkoutCount,
    targetGroupId,
    pricing,
    checkoutLines,
    productSubtotal,
    draftInvoiceIds,
    newQuantityByProductId,
    parkingVehicleCount,
    checkoutAt,
    customerId,
  } = ctx
  const { paidAt, promotionRuleId } = state
  let {
    finalPricing,
    playDiscountTotal,
    playTotal,
    invoiceSubtotal,
    invoiceGrandTotal,
  } = state

  const openShift = await tx.shift.findOpenForStaff(staffId)
  if (!openShift) fail('SHIFT_REQUIRED')

  const shiftId = openShift.id

  // ── Re-validate membership trong transaction (TOCTOU guard) ──
  if (pricing.isMemberSession) {
    const activeNow = await tx.membership.findActive(customerId, new Date())
    if (!activeNow) {
      fail('MEMBERSHIP_EXPIRED_DURING_CHECKOUT')
    }
  }

  const promotion = promotionRuleId
    ? await tx.promotions.findAvailableById(promotionRuleId, checkoutAt)
    : null

  if (promotionRuleId && !promotion) {
    fail('PROMOTION_UNAVAILABLE')
  }

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

  const invoice = await tx.billing.createPaidInvoice({
    invoiceNo: generateInvoiceNo(),
    customerId,
    shiftId,
    staffId,
    paidAt,
    notes: notes || (
      targetGroupId
        ? `Checkout ${checkoutCount} người (${groupLabel})`
        : (checkoutCount < session.playerCount ? `Checkout ${checkoutCount}/${session.playerCount} người` : undefined)
    ),
    subtotal: invoiceSubtotal,
    discountTotal: playDiscountTotal,
    grandTotal: invoiceGrandTotal,
    lines: [],
  })

  // PLAY_TIME item: quantity là tổng person-hours
  await tx.billing.createInvoiceItem({
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
  })

  // ── Phí gửi xe (trừ vào tổng thanh toán) ──
  let parkingFeeTotal = 0
  if (parkingVehicleCount > 0) {
    const unitPrice = await tx.settings.getNumeric(SETTING_KEYS.PARKING_FEE_UNIT_PRICE, 0)
    if (unitPrice > 0) {
      parkingFeeTotal = parkingVehicleCount * unitPrice
      invoiceSubtotal -= parkingFeeTotal
      invoiceGrandTotal = Math.max(0, invoiceGrandTotal - parkingFeeTotal)

      await tx.billing.createInvoiceItem({
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
      })

      await tx.billing.updateInvoiceTotals(invoice.id, invoiceSubtotal, invoiceGrandTotal)
    }
  }

  for (const line of checkoutLines) {
    const latestProduct = await tx.product.findByIdForSale(line.productId)
    if (!latestProduct || !latestProduct.isActive) {
      fail('PRODUCT_UNAVAILABLE')
    }

    const invoiceItem = await tx.billing.createInvoiceItem({
      invoiceId: invoice.id,
      productId: latestProduct.id,
      type: latestProduct.type,
      description: latestProduct.name,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      subtotal: line.subtotal,
      discountAmount: 0,
      total: line.subtotal,
    })

    const newQuantity = newQuantityByProductId.get(line.productId) ?? 0
    if (latestProduct.type === 'PRODUCT' && newQuantity > 0) {
      const stockUpdate = await tx.product.decrementStockIfAvailable(latestProduct.id, newQuantity)
      if (stockUpdate.count === 0) {
        fail('INSUFFICIENT_STOCK', latestProduct.name)
      }

      await tx.product.recordSaleMovement({
        productId: latestProduct.id,
        invoiceItemId: invoiceItem.id,
        shiftId,
        staffId,
        quantity: newQuantity,
        unitCost: latestProduct.costPrice,
        reason: `Bán kèm phiên ${sessionId}`,
      })
    }
  }

  const payment = await tx.billing.createPayment({
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
  })

  // ── Cập nhật group, kiểm tra còn người không ──
  let totalRemaining = 0

  if (targetGroupId) {
    const updatedGroup = await tx.session.decrementGroupRemaining(targetGroupId, checkoutCount)
    if (updatedGroup.remainingCount < 0) {
      fail('PRICING_GROUP_UNDERFLOW')
    }
    totalRemaining = await tx.session.sumRemainingPlayers(sessionId)
  } else {
    // Legacy path: dùng session.playerCount
    totalRemaining = session.playerCount - checkoutCount
  }

  const isFullCheckout = totalRemaining <= 0

  if (isFullCheckout) {
    await tx.session.update(sessionId, {
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
    })
  } else if (!targetGroupId) {
    // Legacy partial checkout
    await tx.session.update(sessionId, {
      playerCount: totalRemaining,
    })
  }

  // Cập nhật customer totals
  await tx.customer.recordPlay(customerId, {
    hours: +(finalPricing.totalHours * checkoutCount).toFixed(2),
    spent: invoiceGrandTotal,
  })

  // ── Chỉ huỷ hóa đơn DRAFT khi checkout toàn bộ phiên ──
  if (isFullCheckout && draftInvoiceIds.length > 0) {
    await tx.billing.cancelDraftInvoices(
      draftInvoiceIds,
      `Đã gộp vào hóa đơn ${invoice.invoiceNo}`
    )
  }

  await tx.audit.append({
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

  return {
    invoice,
    payment,
    remainingPlayers: totalRemaining,
    parkingFeeTotal,
    invoiceNo: invoice.invoiceNo,
    finalPricing,
    playDiscountTotal,
    playTotal,
    invoiceSubtotal,
    invoiceGrandTotal,
  }
}

function moneyPerPerson(value: number): string {
  if (value >= 1000 && value % 1000 === 0) {
    return `${(value / 1000).toLocaleString('vi-VN')}kđ`
  }
  return `${value.toLocaleString('vi-VN')}đ`
}

export function mapCheckoutError(error: DomainError): HttpErrorInfo {
  switch (error.code) {
    case 'SESSION_NOT_FOUND':
      return { code: 'SESSION_NOT_FOUND', message: 'Không tìm thấy phiên', status: 404 }
    case 'SESSION_COMPLETED':
      return { code: 'SESSION_COMPLETED', message: 'Phiên đã kết thúc rồi', status: 400 }
    case 'SESSION_CANCELLED':
      return { code: 'SESSION_CANCELLED', message: 'Phiên đã bị hủy rồi', status: 400 }
    case 'END_TIME_BEFORE_START':
      return { code: 'END_TIME_BEFORE_START', message: 'Thời gian checkout không được trước lúc check-in', status: 400 }
    case 'PRICING_GROUP_NOT_FOUND':
      return { code: 'PRICING_GROUP_NOT_FOUND', message: 'Không tìm thấy nhóm giá', status: 400 }
    case 'PRICING_GROUP_EMPTY':
      return { code: 'PRICING_GROUP_EMPTY', message: 'Nhóm giá đã checkout hết người', status: 400 }
    case 'PRICING_GROUP_UNDERFLOW':
      return { code: 'PRICING_GROUP_UNDERFLOW', message: 'Số người checkout vượt quá số người còn lại của nhóm giá', status: 400 }
    case 'PRODUCT_NOT_FOUND':
      return { code: 'PRODUCT_NOT_FOUND', message: 'Có sản phẩm không tồn tại hoặc đã ngừng bán', status: 400 }
    case 'PRODUCT_UNAVAILABLE':
      return { code: 'PRODUCT_UNAVAILABLE', message: 'Có sản phẩm không còn bán', status: 400 }
    case 'INSUFFICIENT_STOCK':
      return { code: 'INSUFFICIENT_STOCK', message: `${error.detail ?? 'Sản phẩm'} không đủ tồn kho`, status: 400 }
    case 'NO_PLAYERS_TO_CHECKOUT':
      return { code: 'NO_PLAYERS_TO_CHECKOUT', message: 'Không còn người chơi nào để checkout', status: 400 }
    case 'SHIFT_REQUIRED':
      return { code: 'SHIFT_REQUIRED', message: 'Cần mở hoặc tham gia ca trước khi checkout', status: 409 }
    case 'MEMBERSHIP_EXPIRED_DURING_CHECKOUT':
      return { code: 'MEMBERSHIP_EXPIRED_DURING_CHECKOUT', message: 'Gói hội viên đã hết hạn trong lúc checkout. Vui lòng thử lại.', status: 409 }
    case 'PROMOTION_UNAVAILABLE':
      return { code: 'PROMOTION_UNAVAILABLE', message: 'Khuyến mại không còn hiệu lực. Vui lòng chọn lại trước khi thu tiền.', status: 409 }
    case 'PROMOTION_NOT_APPLICABLE':
      return { code: 'PROMOTION_NOT_APPLICABLE', message: 'Khuyến mại chỉ áp dụng cho tiền giờ chơi khách vãng lai.', status: 400 }
    default:
      return { code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 }
  }
}
