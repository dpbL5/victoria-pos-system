// ── Use-case: checkOut — thu tiền, đóng phiên, trừ kho ─────
import { err, ok } from '@/lib/shared/result'
import type { DomainError, Result } from '@/lib/shared/result'
import { fail, runInTransaction } from '@/lib/infrastructure/db-helpers'
import type { Repositories } from '@/lib/infrastructure/repositories'
import { repositories } from '@/lib/infrastructure/repositories'
import type { HttpErrorInfo } from '@/lib/infrastructure/api-helpers'
import {
  toPromotionMetadata,
  type PromotionSnapshot,
} from '@/lib/promotion-calculation'
import { applySellItemStockDeltas } from './sell-items'
import { generateInvoiceNo } from '@/lib/invoicing'
import type { CheckoutPaymentMethod, PlayTimeQuote } from '@/types'
import type { SessionWithPlayers } from '../ports'
import type { CheckoutLine } from './checkout-types'
import { quoteCheckout } from '../checkout-quote'
import type {
  AggregatedPricing,
  QuotePlayer,
  Receipt,
  RuleRef,
} from '../checkout-quote-core'
import { toCheckoutSelection } from '../session-validations'

export interface CheckoutLineInput {
  productId: string
  quantity: number
}

/** Nhóm bảng giá chọn tại checkout cho session chưa gán giá (khách vãng lai) */
export interface CheckoutPricingGroupInput {
  playerCount: number
  pricingRuleId: string
  /** Danh sách người chơi chọn tay vào nhóm này (đúng playerCount) */
  playerIds: string[]
}

export interface CheckoutInput {
  sessionId: string
  staffId: string
  paymentMethod: CheckoutPaymentMethod
  promotionRuleId?: string
  endTime?: Date
  /**
   * DANH SÁCH HÀNG CUỐI CÙNG của phiếu. `undefined` = client không gửi (giữ
   * nguyên dòng bán kèm như cũ); có mảng = hoà giải theo danh sách này.
   */
  items?: CheckoutLineInput[]
  notes?: string
  /** ID của pricing group cần checkout (nếu không có, dùng legacy session.playerCount) */
  pricingGroupId?: string
  /** Số người checkout từ group */
  playerCount?: number
  /** Số lượng xe gửi (phí gửi xe) */
  parkingVehicleCount?: number
  /** Bảng giá áp dụng cho cả phiên — session chưa gán giá lúc check-in */
  pricingRuleId?: string
  /** Chia nhóm bảng giá tại checkout — session chưa gán giá lúc check-in */
  groups?: CheckoutPricingGroupInput[]
  /** Thu trước: chọn người chơi cụ thể (bất kỳ nhóm nào) để checkout — loại trừ với groups/pricingGroupId */
  playerIds?: string[]
  /**
   * Bảng giá chọn cho từng nhóm CHƯA có giá, key = groupId (dùng cùng `playerIds`).
   * Nhóm đã chốt giá ở lần thu trước không cần và không được gửi lại.
   */
  groupPricingRuleIds?: Record<string, string>
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

/** Bảng giá chọn tại checkout cần gán (persist) vào SessionPricingGroup trước khi tạo invoice */
export interface PendingAssignment {
  /** Nhóm đã tồn tại (Nhóm 1 trống) — null nếu tạo nhóm mới (2..N) */
  groupId: string | null
  label: string
  playerCount: number
  pricingRuleId: string
  snapshot: import('@/types').PricingRuleSnapshot
  /** Người chơi chọn tay vào nhóm này — chuyển player sang group sau khi persist */
  playerIds: string[]
  /**
   * Thu trước trên nhóm còn người chưa thu: KHÔNG chốt bảng giá vào nhóm (nhóm giữ
   * nguyên counts + chưa có giá). Bảng giá chỉ áp cho người được thu lần này; phần
   * người còn lại chọn lại bảng giá theo giờ thu ở lần sau. Bỏ cờ = thu hết nhóm.
   */
  preserveCounts?: boolean
}

/** Context đã tính trước transaction — truyền vào runCheckOutTx để test được */
export interface CheckoutContext {
  session: SessionWithPlayers
  sessionId: string
  staffId: string
  paymentMethod: CheckoutPaymentMethod
  endTime: Date
  notes?: string
  checkoutCount: number
  targetGroupId?: string
  pricing: AggregatedPricing
  checkoutLines: CheckoutLine[]
  productSubtotal: number
  /** Các dòng bán kèm chờ thu được gộp vào hoá đơn này (xoá sau khi gộp) */
  mergedSellItemIds: string[]
  /** Snapshot dòng bán kèm — để tạo InvoiceItem */
  sellItemLines: Array<{
    id: string
    productId: string
    quantity: number
    unitPrice: number
  }>
  /**
   * Chênh lệch tồn kho do người dùng sửa số lượng lúc thu (dòng bán kèm đã trừ
   * kho lúc thêm vào phiên): >0 = trừ thêm, <0 = hoàn kho. Chỉ áp cho PRODUCT.
   */
  sellStockDeltas: Array<{ productId: string; delta: number }>
  newQuantityByProductId: Map<string, number>
  parkingVehicleCount: number
  checkoutAt: Date
  /** Null với khách vãng lai (không tạo Customer) */
  customerId: string | null
  /** Tên khách vãng lai (từ session.customerName) — null với hội viên */
  customerName: string | null
  /** Bảng giá chọn tại checkout — persist vào pricing groups trước khi tính tiền (session mới) */
  pendingAssignments?: PendingAssignment[]
  /**
   * Các player được thu lần này (chưa checkout, theo thứ tự createdAt, cắt checkoutCount).
   * Rỗng với session cũ không có player rows (legacy) → tính như cũ.
   */
  playersToBill: QuotePlayer[]
  /**
   * Bảng giá riêng theo từng nhóm (index nhóm → rule) khi chia nhiều bảng giá.
   * Có khi checkout tất cả nhóm trong 1 lần — mỗi player tính theo rule của nhóm chứa nó.
   */
  groupRuleMap?: Map<number, RuleRef>
  /** Nhiều bảng giá: playerIds theo từng nhóm (index) — xác định nhóm của từng player + chuyển player */
  playersToBillByGroup?: string[][]
  /**
   * Thu trước trên session đã gán giá: groupId theo từng nhóm (index-aligned với
   * playersToBillByGroup) — để decrement remainingCount cho đúng nhóm sở hữu.
   */
  earlyCollectionGroupIds?: string[]
  /**
   * Mốc tính pause: min(endTime, checkoutAt) — không trừ pause sau thời điểm phiên kết thúc.
   * Đồng bộ với preview (dùng endTime làm mốc).
   */
  pauseRef: Date
  bookingDeposit?: {
    bookingId: string
    expectedApplied: number
    expectedRefunded: number
    remaining: number
    depositInvoiceId: string | null
    paymentMethod: 'CASH' | 'TRANSFER' | 'CARD' | null
  }
  /** Chuỗi số của phiếu đã chốt từ quote — transaction không tính lại */
  receipt: Receipt
  playerPauses: Array<{ id: string; name: string; pausedSeconds: number }>
  playPausedSeconds: number
  groupLabel: string
  parkingFeeUnitPrice: number
  parkingTotal: number
  playerPricing: NonNullable<PlayTimeQuote['playerPricing']>
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
    pricingRuleId,
    groups,
    playerIds,
    groupPricingRuleIds,
  } = input

  // ── Pha 1: Guard trước transaction ──
  const session = await deps.session.findByIdWithPlayers(sessionId)
  if (!session) return err('SESSION_NOT_FOUND')
  if (session.status !== 'ACTIVE') {
    return err(session.status === 'COMPLETED' ? 'SESSION_COMPLETED' : 'SESSION_CANCELLED')
  }
  if (endTime < session.startTime) return err('END_TIME_BEFORE_START')

  const checkoutAt = new Date()
  const selection = toCheckoutSelection({
    groups,
    playerIds,
    groupPricingRuleIds,
    pricingGroupId,
    playerCount,
  })

  const quoteResult = await quoteCheckout(deps, session, selection, {
    endTime,
    quoteAt: checkoutAt,
    promotionRuleId,
    pricingRuleId,
    items,
    parkingVehicleCount,
  })
  if (!quoteResult.ok) return quoteResult

  const { quote, assignments, persistence } = quoteResult.value

  let finalPricing = persistence.playPricing
  let playDiscountTotal = quote.discountAmount
  let playTotal = quote.grandTotal
  let invoiceSubtotal = persistence.receipt.charges
  // Receipt đã trừ parking; invoice được tạo trước bước parking nên cộng lại.
  let invoiceGrandTotal = persistence.receipt.total + persistence.parkingTotal

  const ctx: CheckoutContext = {
    session,
    sessionId,
    staffId,
    paymentMethod,
    endTime,
    notes,
    checkoutCount: persistence.checkoutCount,
    targetGroupId: persistence.targetGroupId,
    pricing: persistence.playPricing,
    checkoutLines: persistence.checkoutLines,
    productSubtotal: persistence.productSubtotal,
    mergedSellItemIds: persistence.mergedSellItemIds,
    sellItemLines: persistence.sellItemLines,
    sellStockDeltas: persistence.sellStockDeltas,
    newQuantityByProductId: persistence.newQuantities,
    parkingVehicleCount: persistence.parkingVehicleCount,
    checkoutAt,
    customerId: session.customerId,
    customerName: session.customerName ?? null,
    pendingAssignments: assignments,
    playersToBill: persistence.playersToBill,
    groupRuleMap: persistence.groupRuleMap,
    playersToBillByGroup: persistence.playersToBillByGroup,
    earlyCollectionGroupIds: persistence.earlyCollectionGroupIds,
    pauseRef: persistence.pauseRef,
    bookingDeposit: persistence.bookingDeposit,
    receipt: persistence.receipt,
    playerPauses: persistence.playerPauses,
    playPausedSeconds: persistence.playPausedSeconds,
    groupLabel: persistence.groupLabel,
    parkingFeeUnitPrice: persistence.parkingFeeUnitPrice,
    parkingTotal: persistence.parkingTotal,
    playerPricing: quote.playerPricing ?? [],
  }

  const result = await runInTransaction((tx) =>
    runCheckOutTx(tx, ctx, {
      finalPricing,
      playDiscountTotal,
      playTotal,
      invoiceSubtotal,
      invoiceGrandTotal,
      paidAt: checkoutAt,
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
    customerName: session.customerName ?? session.customer?.fullName ?? 'Khách lẻ',
    startTime: session.startTime,
    endTime,
    totalHours: finalPricing.totalHours,
    hourlyRate: finalPricing.hourlyRate,
    subtotal: invoiceSubtotal,
    playSubtotal: finalPricing.subtotal,
    productSubtotal: persistence.productSubtotal,
    promotionDiscount: playDiscountTotal,
    grandTotal: invoiceGrandTotal,
    isMemberSession: finalPricing.isMemberSession,
    promotion: finalPricing.promotion,
    paymentMethod,
    paymentId: result.value.payment.id,
    checkedOutPlayers: persistence.checkoutCount,
    remainingPlayers: result.value.remainingPlayers,
    sessionClosed: isFullCheckout,
    parkingFeeTotal: result.value.parkingFeeTotal,
  })
}

export interface CheckoutTxState {
  finalPricing: AggregatedPricing
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
  finalPricing: AggregatedPricing
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
    mergedSellItemIds,
    sellItemLines,
    sellStockDeltas,
    newQuantityByProductId,
    parkingVehicleCount,
    checkoutAt,
    customerId,
    customerName,
    pendingAssignments,
    playersToBill,
    groupRuleMap,
    playersToBillByGroup,
    earlyCollectionGroupIds,
    bookingDeposit,
  } = ctx
  const { paidAt, promotionRuleId, finalPricing, playDiscountTotal, playTotal } = state
  let { invoiceSubtotal, invoiceGrandTotal } = state

  const openShift = await tx.shift.findOpenIdForStaff(staffId)
  if (!openShift) fail('SHIFT_REQUIRED')

  const shiftId = openShift.id

  // ── Gán bảng giá cho pricing groups (session mới, chọn giá tại checkout) ──
  if (pendingAssignments && pendingAssignments.length > 0) {
    for (let i = 0; i < pendingAssignments.length; i += 1) {
      const assignment = pendingAssignments[i]
      let groupId = assignment.groupId
      if (assignment.groupId) {
        // preserveCounts = thu trước, nhóm còn người chưa thu → KHÔNG ghi bảng giá
        // vào nhóm: giá chỉ áp cho người được thu lần này, phần còn lại chọn lại
        // bảng giá theo giờ thu ở lần sau (không bị khoá theo lần thu trước).
        if (!assignment.preserveCounts) {
          await tx.session.updatePricingGroup(assignment.groupId, {
            label: assignment.label,
            playerCount: assignment.playerCount,
            remainingCount: assignment.playerCount,
            hourlyRate: assignment.snapshot.ratePerHour,
            pricingRuleId: assignment.pricingRuleId,
            pricingSnapshot: assignment.snapshot,
          })
        }
      } else {
        const created = await tx.session.createPricingGroup({
          sessionId,
          label: assignment.label,
          playerCount: assignment.playerCount,
          remainingCount: assignment.playerCount,
          hourlyRate: assignment.snapshot.ratePerHour,
          pricingRuleId: assignment.pricingRuleId,
          pricingSnapshot: assignment.snapshot,
        })
        groupId = created.id
        // Ghi lại id thật để phần decrement dùng đúng group
        assignment.groupId = created.id
      }
      // Chuyển player chọn tay vào đúng nhóm (nhiều bảng giá).
      // preserveCounts (thu trước): người chọn đã thuộc nhóm sở hữu từ check-in — không move.
      const playerIds = assignment.playerIds
      if (groupId && playerIds.length > 0 && !assignment.preserveCounts) {
        await tx.session.movePlayersToGroup(playerIds, groupId)
      }
    }
  }

  // ── Re-validate invariant trong transaction (Q15=A) ──
  // Quote đã tính tiền; tx chỉ kiểm dữ liệu còn đúng để persist số đó.
  if (pricing.isMemberSession) {
    if (!customerId) fail('MEMBERSHIP_EXPIRED_DURING_CHECKOUT')
    const activeNow = await tx.membership.findActive(customerId, new Date())
    if (!activeNow) fail('MEMBERSHIP_EXPIRED_DURING_CHECKOUT')
  }

  const promotion = promotionRuleId
    ? await tx.promotions.findAvailableById(promotionRuleId, checkoutAt)
    : null
  if (promotionRuleId && !promotion) fail('PROMOTION_UNAVAILABLE')
  if (promotionRuleId && pricing.promotion) {
    if (
      promotion?.ruleId !== pricing.promotion.ruleId ||
      promotion?.discountType !== pricing.promotion.discountType ||
      Number(promotion?.discountValue) !== Number(pricing.promotion.discountValue)
    ) {
      fail('CHECKOUT_STALE')
    }
  }

  // Re-load để bắt thay đổi giữa quote và transaction. Fake repo cũ không
  // implement findByIdWithPlayers → fallback context đã load trước đó.
  const currentSession = (await tx.session.findByIdWithPlayers(sessionId)) ?? session
  if (currentSession.status !== 'ACTIVE') fail('CHECKOUT_STALE')

  const currentPlayerIds = new Set(
    currentSession.pricingGroups
      .flatMap((group) => group.players)
      .filter((player) => !player.checkedOutAt)
      .map((player) => player.id)
  )
  for (const player of playersToBill) {
    if (!currentPlayerIds.has(player.id)) fail('CHECKOUT_STALE')
  }
  const groupHasPlayers = currentSession.pricingGroups.some((group) => group.players.length > 0)
  if (groupHasPlayers && playersToBill.length < checkoutCount) {
    fail('PLAYER_CHECKOUT_MISMATCH')
  }

  if (targetGroupId) {
    const group = currentSession.pricingGroups.find((candidate) => candidate.id === targetGroupId)
    if (!group || group.remainingCount < checkoutCount) fail('CHECKOUT_STALE')
  }
  if (playersToBillByGroup) {
    const groupIds = pendingAssignments
      ? pendingAssignments.map((assignment) => assignment.groupId)
      : earlyCollectionGroupIds ?? []
    for (let index = 0; index < playersToBillByGroup.length; index += 1) {
      const groupId = groupIds[index]
      const count = playersToBillByGroup[index]?.length ?? 0
      if (!groupId || count === 0) continue
      const group = currentSession.pricingGroups.find((candidate) => candidate.id === groupId)
      if (!group || group.remainingCount < count) fail('CHECKOUT_STALE')
    }
  }
  if (bookingDeposit) {
    const booking = currentSession.booking
    if (
      !booking ||
      Number(booking.depositAppliedAmount) !== bookingDeposit.expectedApplied ||
      Number(booking.depositRefundedAmount) !== bookingDeposit.expectedRefunded
    ) {
      fail('BOOKING_DEPOSIT_STALE')
    }
  }

  // Số tiền lấy từ quote — không tính lại. Receipt đã trừ parking; invoice
  // được tạo trước bước parking nên cộng lại để bước dưới trừ đúng một lần.
  invoiceSubtotal = ctx.receipt.charges
  invoiceGrandTotal = ctx.receipt.total + ctx.parkingTotal
  const groupLabel = ctx.groupLabel
  const playPausedSeconds = ctx.playPausedSeconds
  const playerPauses = ctx.playerPauses
  const playerPricing = ctx.playerPricing

  // ── Thu trước: tự động detect dựa trên số người được thu ──
  // Thu số người < số người đang chơi còn lại → thu trước (ghi nhãn "lần n").
  // Thu hết (checkoutCount >= unCheckedOutBefore) → lần thu cuối, không ghi nhãn.
  const unCheckedOutBefore = session.pricingGroups.reduce(
    (sum, g) => sum + g.players.filter((p) => !p.checkedOutAt).length,
    0
  )
  const isEarlyCollection = checkoutCount < unCheckedOutBefore
  // Cạnh void: hoá đơn thu trước bị huỷ → số thứ tự có thể tái sử dụng. Chấp nhận (nhãn hiển thị).
  const earlyCollectionSequence = isEarlyCollection
    ? (await tx.billing.countPaidBySession(sessionId)) + 1
    : undefined

  const invoice = await tx.billing.createPaidInvoice({
    invoiceNo: generateInvoiceNo(),
    sessionId,
    customerId,
    shiftId,
    staffId,
    paidAt,
    notes: notes || (
      isEarlyCollection
        ? `Thu trước lần ${earlyCollectionSequence} — ${checkoutCount} người`
        : groupRuleMap
          ? `Checkout ${checkoutCount} người (nhiều bảng giá)`
          : targetGroupId
            ? `Checkout ${checkoutCount} người (${groupLabel})`
            : (checkoutCount < session.playerCount ? `Checkout ${checkoutCount}/${session.playerCount} người` : undefined)
    ),
    subtotal: invoiceSubtotal,
    discountTotal: playDiscountTotal,
    grandTotal: invoiceGrandTotal,
    lines: [],
  })

  // PLAY_TIME item: quantity là tổng played hours của các player được thu
  const playQuantity = +(finalPricing.totalHours).toFixed(2)
  await tx.billing.createInvoiceItem({
    invoiceId: invoice.id,
    type: 'PLAY_TIME',
    description: finalPricing.isMemberSession
      ? `Giờ chơi hội viên × ${checkoutCount} người`
      : targetGroupId
        ? `Giờ chơi (${groupLabel}: ${checkoutCount} người × ${moneyPerPerson(finalPricing.hourlyRate)})`
        : `Giờ chơi khách vãng lai × ${checkoutCount} người`,
    quantity: playQuantity,
    unitPrice: finalPricing.hourlyRate,
    subtotal: finalPricing.subtotal,
    discountAmount: playDiscountTotal,
    total: playTotal,
    metadata: {
      sessionId,
      customerType: session.customer?.type ?? 'WALK_IN',
      customerName: customerName ?? session.customer?.fullName ?? null,
      membershipId: session.membershipId,
      isMemberSession: finalPricing.isMemberSession,
      promotion: toPromotionMetadata(finalPricing.promotion),
      playSubtotal: finalPricing.subtotal,
      playTotal,
      checkoutCount,
      // Tổng played hours của các player được thu — không phải của 1 người
      perPersonSubtotal: playersToBill.length > 0
        ? finalPricing.subtotal / checkoutCount
        : finalPricing.subtotal,
      perPersonHours: playersToBill.length > 0
        ? finalPricing.totalHours / checkoutCount
        : finalPricing.totalHours,
      pricingGroupId: targetGroupId ?? null,
      groupLabel: groupLabel || null,
      pausedSeconds: playPausedSeconds,
      playerPauses,
      // Chi tiết giá từng người chơi — hiển thị trên hoá đơn
      playerPricing,
      // Số người được thu lần này (per-player)
      checkedOutPlayers: playersToBill.length > 0 ? checkoutCount : undefined,
      // Thu trước: số thứ tự lần thu — hiển thị badge "(thu trước lần n)" trên hoá đơn
      earlyCollection: earlyCollectionSequence !== undefined
        ? { sequence: earlyCollectionSequence }
        : undefined,
    },
  })

  // ── Phí gửi xe (trừ vào tổng thanh toán) — số đã chốt trong quote ──
  let parkingFeeTotal = 0
  if (ctx.parkingTotal > 0) {
    const unitPrice = ctx.parkingFeeUnitPrice
    parkingFeeTotal = ctx.parkingTotal
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

  // Gồm cả sản phẩm chỉ cần bù kho (dòng bị bỏ khỏi phiếu) — không có nó ở đây
  // thì vòng bù kho dưới không tra được product và bỏ qua, mất hàng không hoàn.
  const productIds = [...new Set([...sellItemLines, ...checkoutLines, ...sellStockDeltas].map((line) => line.productId))]
  const currentProducts = productIds.length > 0 ? await tx.product.findManyByIds(productIds) : []
  const currentProductsById = new Map(currentProducts.map((product) => [product.id, product]))

  // ── Bù kho cho phần người dùng sửa số lượng lúc thu ──
  // Dùng chung với đường lưu-khi-đóng-drawer; xem applySellItemStockDeltas.
  await applySellItemStockDeltas(tx, {
    deltas: sellStockDeltas,
    productTypeById: new Map(currentProducts.map((product) => [product.id, product.type])),
    productNameById: new Map(currentProducts.map((product) => [product.id, product.name])),
    sessionId,
    staffId,
    shiftId,
  })

  // ── Tạo InvoiceItem cho các dòng bán kèm đã chờ thu (không trừ kho — đã trừ lúc bán kèm) ──
  for (const sellLine of sellItemLines) {
    const sellProduct = currentProductsById.get(sellLine.productId)
    if (!sellProduct) {
      fail('PRODUCT_UNAVAILABLE')
    }
    await tx.billing.createInvoiceItem({
      invoiceId: invoice.id,
      productId: sellProduct.id,
      type: sellProduct.type,
      description: sellProduct.name,
      quantity: sellLine.quantity,
      unitPrice: sellLine.unitPrice,
      subtotal: sellLine.quantity * sellLine.unitPrice,
      discountAmount: 0,
      total: sellLine.quantity * sellLine.unitPrice,
    })
  }

  for (const line of checkoutLines) {
    const latestProduct = currentProductsById.get(line.productId)
    if (!latestProduct) {
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
        reason: `Bán kèm phiên ${sessionId}`,
      })
    }
  }

  let depositInvoiceId = bookingDeposit?.depositInvoiceId ?? null
  if (bookingDeposit && bookingDeposit.remaining > 0 && !depositInvoiceId) {
    const depositInvoice = await tx.billing.createPaidInvoice({
      invoiceNo: generateInvoiceNo('DEP', paidAt),
      customerId,
      shiftId,
      staffId,
      paidAt,
      notes: `Tiền đặt cọc lịch ${bookingDeposit.bookingId}`,
      subtotal: bookingDeposit.remaining,
      discountTotal: 0,
      grandTotal: bookingDeposit.remaining,
      lines: [{
        type: 'DEPOSIT',
        description: 'Tiền đặt cọc lịch check-in',
        quantity: 1,
        unitPrice: bookingDeposit.remaining,
        subtotal: bookingDeposit.remaining,
        discountAmount: 0,
        total: bookingDeposit.remaining,
        metadata: { bookingId: bookingDeposit.bookingId },
      }],
    })
    await tx.billing.createPayment({
      kind: 'DEPOSIT',
      invoiceId: depositInvoice.id,
      sessionId,
      shiftId,
      staffId,
      totalHours: 0,
      subtotal: bookingDeposit.remaining,
      discountTotal: 0,
      grandTotal: bookingDeposit.remaining,
      paymentMethod: bookingDeposit.paymentMethod ?? paymentMethod,
      paidAt,
      notes: `Tiền cọc lịch ${bookingDeposit.bookingId}`,
    })
    await tx.booking!.setDepositInvoice(bookingDeposit.bookingId, depositInvoice.id)
    await tx.audit.append({
      userId: staffId,
      action: 'BOOKING_DEPOSIT_CAPTURE',
      entityType: 'Booking',
      entityId: bookingDeposit.bookingId,
      details: { invoiceId: depositInvoice.id, amount: bookingDeposit.remaining, paymentMethod: bookingDeposit.paymentMethod ?? paymentMethod },
    })
    depositInvoiceId = depositInvoice.id
  }

  // ── Áp dụng cọc đã thu cho lịch này, tối đa bằng số tiền checkout ──
  const depositApplied = bookingDeposit ? ctx.receipt.depositApplied : 0
  if (bookingDeposit && depositApplied > 0) {
    const applied = await tx.booking!.applyDeposit(
      bookingDeposit.bookingId,
      bookingDeposit.expectedApplied,
      depositApplied
    )
    if (!applied.count) fail('BOOKING_DEPOSIT_STALE')
    invoiceSubtotal -= depositApplied
    invoiceGrandTotal = Math.max(0, invoiceGrandTotal - depositApplied)
    await tx.billing.createInvoiceItem({
      invoiceId: invoice.id,
      type: 'DEPOSIT_APPLIED',
      description: 'Khấu trừ tiền cọc đã thanh toán',
      quantity: 1,
      unitPrice: -depositApplied,
      subtotal: -depositApplied,
      discountAmount: 0,
      total: -depositApplied,
      metadata: {
        bookingId: bookingDeposit.bookingId,
        depositInvoiceId,
      },
    })
    await tx.billing.updateInvoiceTotals(invoice.id, invoiceSubtotal, invoiceGrandTotal)
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

  if (groupRuleMap) {
    // Nhiều bảng giá: decrement từng group theo số người đã chọn cho nhóm đó (playersToBillByGroup).
    // pendingAssignments → dùng groupId của assignment; thu trước (priced) → dùng earlyCollectionGroupIds.
    if (playersToBillByGroup) {
      const groupIds = pendingAssignments
        ? pendingAssignments.map((a) => a.groupId)
        : earlyCollectionGroupIds ?? []
      for (let i = 0; i < playersToBillByGroup.length; i += 1) {
        const groupId = groupIds[i]
        const count = playersToBillByGroup[i]?.length ?? 0
        if (groupId && count > 0) {
          const updatedGroup = await tx.session.decrementGroupRemaining(groupId, count)
          if (updatedGroup.remainingCount < 0) {
            fail('PRICING_GROUP_UNDERFLOW')
          }
        }
      }
    }
    totalRemaining = await tx.session.sumRemainingPlayers(sessionId)
  } else if (targetGroupId) {
    const updatedGroup = await tx.session.decrementGroupRemaining(targetGroupId, checkoutCount)
    if (updatedGroup.remainingCount < 0) {
      fail('PRICING_GROUP_UNDERFLOW')
    }
    totalRemaining = await tx.session.sumRemainingPlayers(sessionId)
  } else {
    // Legacy path: dùng session.playerCount
    totalRemaining = session.playerCount - checkoutCount
  }

  // ── Đánh dấu các player đã thu (checkout từng phần) ──
  if (playersToBill.length > 0) {
    await tx.session.markPlayersCheckedOut(
      playersToBill.map((p) => p.id),
      checkoutAt
    )
  }

  const isFullCheckout = totalRemaining <= 0

  let depositRefund = 0
  if (isFullCheckout && bookingDeposit) {
    depositRefund = Math.max(0, bookingDeposit.remaining - depositApplied)
    if (depositRefund > 0) {
      const marked = await tx.booking!.applyRefund(
        bookingDeposit.bookingId,
        bookingDeposit.expectedRefunded,
        depositRefund
      )
      if (!marked.count) fail('BOOKING_DEPOSIT_STALE')
      const refundInvoice = await tx.billing.createPaidInvoice({
        invoiceNo: generateInvoiceNo('DEP'),
        sessionId,
        customerId,
        shiftId,
        staffId,
        paidAt,
        notes: `Hoàn phần cọc chưa sử dụng của lịch ${bookingDeposit.bookingId}`,
        subtotal: -depositRefund,
        discountTotal: 0,
        grandTotal: -depositRefund,
        lines: [{
          type: 'DEPOSIT',
          description: 'Hoàn phần tiền cọc chưa sử dụng',
          quantity: 1,
          unitPrice: -depositRefund,
          subtotal: -depositRefund,
          discountAmount: 0,
          total: -depositRefund,
          metadata: { bookingId: bookingDeposit.bookingId, refund: true },
        }],
      })
      await tx.billing.createPayment({
        kind: 'DEPOSIT',
        invoiceId: refundInvoice.id,
        sessionId,
        shiftId,
        staffId,
        totalHours: 0,
        subtotal: -depositRefund,
        discountTotal: 0,
        grandTotal: -depositRefund,
        paymentMethod: bookingDeposit.paymentMethod ?? 'CASH',
        paidAt,
        notes: `Hoàn cọc lịch ${bookingDeposit.bookingId}`,
      })
      await tx.booking!.setDepositRefundInvoice(bookingDeposit.bookingId, refundInvoice.id)
      await tx.audit.append({
        userId: staffId,
        action: 'BOOKING_DEPOSIT_REFUND',
        entityType: 'Booking',
        entityId: bookingDeposit.bookingId,
        details: { invoiceId: refundInvoice.id, amount: depositRefund, paymentMethod: bookingDeposit.paymentMethod ?? 'CASH' },
      })
    }
  }

  if (isFullCheckout) {
    await tx.session.update(sessionId, {
      shiftId,
      endTime,
      status: 'COMPLETED',
      playerCount: 0,
      totalHours: finalPricing.totalHours,
      subtotal: finalPricing.subtotal,
      pausedAt: null,
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

  // Cập nhật customer totals — chỉ với khách đã đăng ký (hội viên);
  // khách vãng lai không có Customer nên không tích luỹ tổng chi tiêu.
  if (customerId) {
    await tx.customer.recordPlay(customerId, {
      hours: +(finalPricing.totalHours * checkoutCount).toFixed(2),
      spent: invoiceGrandTotal + depositApplied,
    })
  }

  // ── Xoá các dòng bán kèm đã gộp vào hoá đơn này ──
  if (mergedSellItemIds.length > 0) {
    await tx.session.removeSellItems(mergedSellItemIds)
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
      mergedSellItemCount: mergedSellItemIds.length > 0 ? mergedSellItemIds.length : undefined,
      parkingFeeTotal: parkingFeeTotal || undefined,
      depositApplied: depositApplied || undefined,
      depositRefund: depositRefund || undefined,
      // Thu trước: nhóm còn người chưa thu không ghi bảng giá vào nhóm → không tính
      // là "chốt giá tại checkout"; bảng giá đã dùng vẫn nằm ở metadata PLAY_TIME.
      pricingAssignedAtCheckout: (pendingAssignments?.filter((a) => !a.preserveCounts).length ?? 0) > 0,
      assignedPricingRuleIds: pendingAssignments?.filter((a) => !a.preserveCounts).map(a => a.pricingRuleId),
      earlyCollection: earlyCollectionSequence !== undefined
        ? { sequence: earlyCollectionSequence }
        : undefined,
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
    case 'PLAYER_CHECKOUT_MISMATCH':
      return { code: 'PLAYER_CHECKOUT_MISMATCH', message: 'Số người chơi cần thu vượt quá số người còn lại. Vui lòng tải lại phiên.', status: 409 }
    case 'CHECKOUT_STALE':
      return { code: 'CHECKOUT_STALE', message: 'Dữ liệu phiên đã thay đổi. Vui lòng tải lại rồi thu tiền.', status: 409 }
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
    case 'BOOKING_DEPOSIT_STALE':
      return { code: 'BOOKING_DEPOSIT_STALE', message: 'Số dư cọc đã thay đổi. Vui lòng tải lại phiên rồi thử lại.', status: 409 }
    case 'MEMBERSHIP_EXPIRED_DURING_CHECKOUT':
      return { code: 'MEMBERSHIP_EXPIRED_DURING_CHECKOUT', message: 'Gói hội viên đã hết hạn trong lúc checkout. Vui lòng thử lại.', status: 409 }
    case 'PROMOTION_UNAVAILABLE':
      return { code: 'PROMOTION_UNAVAILABLE', message: 'Khuyến mại không còn hiệu lực. Vui lòng chọn lại trước khi thu tiền.', status: 409 }
    case 'PROMOTION_NOT_APPLICABLE':
      return { code: 'PROMOTION_NOT_APPLICABLE', message: 'Khuyến mại chỉ áp dụng cho tiền giờ chơi khách vãng lai.', status: 400 }
    case 'GROUP_PLAYER_COUNT_MISMATCH':
      return { code: 'GROUP_PLAYER_COUNT_MISMATCH', message: 'Tổng số người trong các nhóm không khớp số người chơi của phiên', status: 400 }
    case 'PRICING_RULE_NOT_EFFECTIVE':
      return { code: 'PRICING_RULE_NOT_EFFECTIVE', message: 'Bảng giá đã chọn không còn hiệu lực. Vui lòng chọn bảng giá khác.', status: 400 }
    case 'PRICING_RULE_NOT_FOUND':
      return {
        code: 'PRICING_RULE_NOT_FOUND',
        message: 'Không có quy tắc bảng giá hiệu lực cho thời điểm hiện tại. Vui lòng cập nhật bảng giá trước khi thu tiền.',
        status: 400,
      }
    default:
      return { code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 }
  }
}
