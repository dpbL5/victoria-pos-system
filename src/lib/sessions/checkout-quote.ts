// ── Checkout quote resolver — server-side, nạp dữ liệu rồi gọi core ─────
// Preview route và checkOut dùng CÙNG module này để không còn hai cách chọn
// người/tính tiền. Không chứa HTTP; route chỉ parse + delegate.

import { getDayType, getVnHour } from '@/lib/shared/utils'
import { err, ok } from '@/lib/shared/result'
import type { Result } from '@/lib/shared/result'
import { SETTING_KEYS } from '@/lib/settings/ports'
import type { SettingsRepository } from '@/lib/settings/ports'
import type { MembershipRepository } from '@/lib/memberships/ports'
import type { PricingRepository } from '@/lib/pricing/ports'
import type { PromotionRepository } from '@/lib/promotions/ports'
import type { PlayTimeQuote, PlayTimeStockIssue } from '@/types'
import { diffSellItems, type SellItemLine, type SellItemStockDelta } from './sell-item-diff'
import type { ProductRecord, ProductRepository, SessionRepository } from './ports'
import { playerPauseWithSessionFallback } from './session-pause'
import {
  aggregatePlayerPricing,
  asSnapshot,
  calculateReceipt,
  classifySession,
  collectRuleRequirements,
  depositRemainingOf,
  pausedSecondsForGroup,
  planSelection,
  resolveBasePricing,
  ruleLookup,
  type AggregatedPricing,
  type CheckoutQuoteOptions,
  type CheckoutSelection,
  type PendingAssignment,
  type QuoteGroup,
  type QuotePlayer,
  type QuoteSession,
  type Receipt,
  type RuleRef,
} from './checkout-quote-core'
import type { CheckoutLine } from './use-cases/checkout-types'

export interface CheckoutQuoteDeps {
  session: Pick<SessionRepository, 'findSellItems'>
  pricing: Pick<PricingRepository, 'findManyByIdsWithTiers' | 'findApplicableRule'>
  promotions: Pick<PromotionRepository, 'findAvailableById'>
  membership: Pick<MembershipRepository, 'findActive'>
  settings: Pick<SettingsRepository, 'getNumeric'>
  product: Pick<ProductRepository, 'findManyByIds'>
}

/** Dữ liệu quote đã tính, đủ để transaction persist mà không tính lại tiền. */
export interface CheckoutQuotePersistence {
  checkoutCount: number
  targetGroupId?: string
  playersToBill: QuotePlayer[]
  playersToBillByGroup?: string[][]
  earlyCollectionGroupIds?: string[]
  groupRuleMap?: Map<number, RuleRef>
  pendingAssignments: PendingAssignment[]
  pauseRef: Date
  sellItemLines: SellItemLine[]
  sellStockDeltas: SellItemStockDelta[]
  newQuantities: Map<string, number>
  checkoutLines: CheckoutLine[]
  mergedSellItemIds: string[]
  productSubtotal: number
  parkingVehicleCount: number
  parkingFeeUnitPrice: number
  parkingTotal: number
  bookingDeposit?: {
    bookingId: string
    expectedApplied: number
    expectedRefunded: number
    remaining: number
    depositInvoiceId: string | null
    paymentMethod: 'CASH' | 'TRANSFER' | 'CARD' | null
  }
  playPricing: AggregatedPricing
  receipt: Receipt
  playerPauses: Array<{ id: string; name: string; pausedSeconds: number }>
  playPausedSeconds: number
  groupLabel: string
}

export interface CheckoutQuoteResult {
  quote: PlayTimeQuote
  /** Chỉ server dùng để persist snapshot nhóm; preview bỏ qua */
  assignments: PendingAssignment[]
  persistence: CheckoutQuotePersistence
}

function desiredItems(
  items: Array<{ productId: string; quantity: number }>
): Map<string, number> {
  const map = new Map<string, number>()
  for (const item of items) {
    map.set(item.productId, (map.get(item.productId) ?? 0) + item.quantity)
  }
  return map
}

function stockIssuesFor(
  persistedLines: SellItemLine[],
  newLines: CheckoutLine[],
  productById: Map<string, ProductRecord>
): PlayTimeStockIssue[] {
  const issues: PlayTimeStockIssue[] = []

  for (const line of persistedLines) {
    const product = productById.get(line.productId)
    if (!product || product.type !== 'PRODUCT') continue
    // Dòng bán kèm đã trừ kho lúc thêm; tồn khả dụng cho chính dòng này là
    // tồn hiện tại + số đã giữ. Chỉ báo khi có giao dịch khác làm âm kho.
    const available = product.stockQuantity + line.quantity
    if (line.quantity > available) {
      issues.push({
        productId: product.id,
        productName: product.name,
        requested: line.quantity,
        available: Math.max(0, available),
      })
    }
  }

  for (const line of newLines) {
    const product = productById.get(line.productId)
    if (!product || product.type !== 'PRODUCT') continue
    if (line.quantity > product.stockQuantity) {
      issues.push({
        productId: product.id,
        productName: product.name,
        requested: line.quantity,
        available: Math.max(0, product.stockQuantity),
      })
    }
  }

  return issues
}

function pricingGroupsOf(
  session: QuoteSession,
  pauseRef: Date
): PlayTimeQuote['pricingGroups'] {
  return session.pricingGroups.map((group: QuoteGroup) => ({
    id: group.id,
    sessionId: session.id,
    label: group.label,
    playerCount: group.playerCount,
    remainingCount: group.remainingCount,
    hourlyRate: Number(group.hourlyRate),
    pricingRuleId: group.pricingRuleId,
    pricingSnapshot: asSnapshot(group.pricingSnapshot),
    pausedSeconds: pausedSecondsForGroup(group, pauseRef),
    players:
      group.players.length > 0
        ? group.players.map((player) => ({
            id: player.id,
            name: player.name,
            pausedAt: player.pausedAt ? player.pausedAt.toISOString() : null,
            totalPausedSeconds: player.totalPausedSeconds,
            checkedOutAt: player.checkedOutAt ? player.checkedOutAt.toISOString() : null,
            position: player.position,
          }))
        : undefined,
  }))
}

export async function quoteCheckout(
  deps: CheckoutQuoteDeps,
  session: QuoteSession,
  selection: CheckoutSelection,
  options: CheckoutQuoteOptions
): Promise<Result<CheckoutQuoteResult>> {
  if (options.endTime < session.startTime) return err('END_TIME_BEFORE_START')

  const quoteAt = options.quoteAt ?? new Date()
  const pauseRef = new Date(Math.min(options.endTime.getTime(), quoteAt.getTime()))
  const { isMemberSession } = classifySession(session)

  const requirements = collectRuleRequirements(session, selection, options)
  const explicitRules =
    requirements.explicitRuleIds.length > 0
      ? await deps.pricing.findManyByIdsWithTiers(requirements.explicitRuleIds)
      : []
  const autoRule = requirements.needsAutoRule
    ? await deps.pricing.findApplicableRule(getVnHour(quoteAt), getDayType(quoteAt), quoteAt)
    : null
  const rules = ruleLookup(explicitRules, autoRule)

  const planResult = planSelection(session, selection, rules, options, quoteAt, pauseRef)
  if (!planResult.ok) return planResult
  const plan = planResult.value

  const promotion = options.promotionRuleId
    ? await deps.promotions.findAvailableById(options.promotionRuleId, quoteAt)
    : null
  if (options.promotionRuleId && !promotion) return err('PROMOTION_UNAVAILABLE')
  if (isMemberSession && promotion) return err('PROMOTION_NOT_APPLICABLE')

  // Hội viên: session.membership có thể chưa load/đã cũ → hỏi findActive tại endTime.
  let hasActiveMembership =
    !!session.membership && session.membership.expiresAt >= options.endTime
  if (!hasActiveMembership && session.customer?.type === 'MEMBER' && session.customerId) {
    const active = await deps.membership.findActive(session.customerId, options.endTime)
    hasActiveMembership = !!active
  }

  const baseResult = resolveBasePricing(
    session,
    plan,
    options,
    promotion,
    rules,
    hasActiveMembership
  )
  if (!baseResult.ok) return baseResult
  if (baseResult.value.membershipExpired) {
    return err('MEMBERSHIP_EXPIRED_DURING_CHECKOUT')
  }

  const pricing = aggregatePlayerPricing(
    session,
    plan,
    options,
    promotion,
    baseResult.value,
    pauseRef
  )

  // ── Dòng hàng: danh sách cuối (checkout) hoặc dòng bán kèm đã persist (preview) ──
  const sellItems = await deps.session.findSellItems(session.id)
  const desired = options.items === undefined ? null : desiredItems(options.items)
  const diff = diffSellItems(sellItems, desired)

  const quantityByProductId = new Map<string, number>()
  for (const line of diff.lines) {
    quantityByProductId.set(
      line.productId,
      (quantityByProductId.get(line.productId) ?? 0) + line.quantity
    )
  }
  for (const [productId, quantity] of diff.newQuantities) {
    quantityByProductId.set(
      productId,
      (quantityByProductId.get(productId) ?? 0) + quantity
    )
  }

  const productIds = [...quantityByProductId.keys()]
  const products =
    productIds.length > 0 ? await deps.product.findManyByIds(productIds) : []
  if (products.length !== productIds.length) return err('PRODUCT_NOT_FOUND')
  const productById = new Map(products.map((product) => [product.id, product]))

  const newLines: CheckoutLine[] = products
    .filter((product) => diff.newQuantities.has(product.id))
    .map((product) => {
      const quantity = diff.newQuantities.get(product.id) ?? 0
      return {
        productId: product.id,
        type: product.type,
        description: product.name,
        quantity,
        unitPrice: product.price,
        subtotal: quantity * product.price,
      }
    })

  const sellSubtotal = diff.lines.reduce(
    (sum, line) => sum + line.quantity * line.unitPrice,
    0
  )
  const productSubtotal =
    newLines.reduce((sum, line) => sum + line.subtotal, 0) + sellSubtotal

  const pendingSellItems: PlayTimeQuote['pendingSellItems'] = diff.lines.map((line) => {
    const product = productById.get(line.productId)
    return {
      productId: line.productId,
      productName: product?.name ?? 'Sản phẩm',
      type: product?.type ?? 'PRODUCT',
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      subtotal: line.quantity * line.unitPrice,
      sessionSellItemId: line.id,
    }
  })

  const parkingFeeUnitPrice = await deps.settings.getNumeric(
    SETTING_KEYS.PARKING_FEE_UNIT_PRICE,
    0
  )
  const parkingTotal = (options.parkingVehicleCount ?? 0) * parkingFeeUnitPrice
  const receipt = calculateReceipt({
    playGross: pricing.subtotal,
    itemsTotal: productSubtotal,
    discount: pricing.promotionDiscount,
    parkingTotal,
    depositRemaining: depositRemainingOf(session),
  })

  const stockIssues = stockIssuesFor(diff.lines, newLines, productById)

  const quote: PlayTimeQuote = {
    sessionId: session.id,
    totalHours: pricing.totalHours,
    hourlyRate: pricing.hourlyRate,
    subtotal: pricing.subtotal,
    discountAmount: pricing.promotionDiscount,
    grandTotal: pricing.grandTotal,
    isMemberSession: pricing.isMemberSession,
    promotion: pricing.promotion,
    pendingSellTotal: sellSubtotal,
    pendingSellItems,
    playerCount: session.playerCount,
    pricingGroupId:
      selection.mode === 'groupSlice' ? selection.pricingGroupId : undefined,
    pricingGroups: pricingGroupsOf(session, pauseRef),
    parkingFeeUnitPrice: parkingFeeUnitPrice || undefined,
    pausedSeconds: plan.pausedSeconds,
    playerPricing:
      pricing.playerPricing && pricing.playerPricing.length > 0
        ? pricing.playerPricing
        : undefined,
    charges: receipt.charges,
    total: receipt.total,
    depositApplied: receipt.depositApplied,
    payable: receipt.payable,
    stockIssues: stockIssues.length > 0 ? stockIssues : undefined,
  }

  const bookingMethod = session.booking?.depositPaymentMethod
  const bookingDeposit = session.booking
    ? {
        bookingId: session.booking.id,
        expectedApplied: Number(session.booking.depositAppliedAmount),
        expectedRefunded: Number(session.booking.depositRefundedAmount),
        remaining: depositRemainingOf(session),
        depositInvoiceId: session.booking.depositInvoiceId,
        paymentMethod:
          bookingMethod === 'MEMBER'
            ? null
            : (bookingMethod as 'CASH' | 'TRANSFER' | 'CARD' | null),
      }
    : undefined

  const playerPauses = plan.playersToBill.map((player) => ({
    id: player.id,
    name: player.name ?? '',
    pausedSeconds: playerPauseWithSessionFallback(
      player,
      session,
      pauseRef,
      plan.checkoutCount
    ),
  }))
  const playPausedSeconds =
    plan.playersToBill.length > 0
      ? playerPauses.reduce((sum, entry) => sum + entry.pausedSeconds, 0)
      : (session.totalPausedSeconds ?? 0)
  const groupLabel = plan.targetGroupId
    ? (session.pricingGroups.find((candidate) => candidate.id === plan.targetGroupId)?.label ?? '')
    : ''

  return ok({
    quote,
    assignments: plan.pendingAssignments,
    persistence: {
      checkoutCount: plan.checkoutCount,
      targetGroupId: plan.targetGroupId,
      playersToBill: plan.playersToBill,
      playersToBillByGroup: plan.playersToBillByGroup,
      earlyCollectionGroupIds: plan.earlyCollectionGroupIds,
      groupRuleMap: plan.groupRuleMap,
      pendingAssignments: plan.pendingAssignments,
      pauseRef,
      sellItemLines: diff.lines,
      sellStockDeltas: diff.stockDeltas,
      newQuantities: diff.newQuantities,
      checkoutLines: newLines,
      mergedSellItemIds: sellItems.map((item) => item.id),
      productSubtotal,
      parkingVehicleCount: options.parkingVehicleCount ?? 0,
      parkingFeeUnitPrice,
      parkingTotal,
      bookingDeposit,
      playPricing: pricing,
      receipt,
      playerPauses,
      playPausedSeconds,
      groupLabel,
    },
  })
}
