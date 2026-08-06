'use client'

import { useEffect, useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label, Select } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { useToast } from '@/components/ui/toast'
import { apiJson, jsonRequest } from './api'
import { calcElapsedHMS, money, paymentMethodLabel, toNumber } from './format'
import { formatPromotionOption } from './promotion-option'
import { InvoiceRow } from './invoice-row'
import type { PlayTimeQuote, PromotionSnapshot } from '@/types'
import type { PaymentMethod, Product, SessionRow } from './types'

interface CheckoutResponse {
  grandTotal: number
}

export function CheckoutDrawer({  session,
  frozenAt,
  products,
  shiftReady,
  submitting,
  setSubmitting,
  onClose,
  onDone,
}: {
  session: SessionRow | null
  frozenAt: string | null
  products: Product[]
  shiftReady: boolean
  submitting: boolean
  setSubmitting: (value: boolean) => void
  onClose: () => void
  onDone: () => Promise<void>
}) {
  const { success: notifySuccess, error: notifyError } = useToast()
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH')
  const [cart, setCart] = useState<Record<string, number>>({})
  const [checkoutPlayerCount, setCheckoutPlayerCount] = useState(1)
  const [playQuote, setPlayQuote] = useState<PlayTimeQuote | null>(null)
  const [promotions, setPromotions] = useState<PromotionSnapshot[]>([])
  const [promotionRuleId, setPromotionRuleId] = useState('')
  const [promotionsLoading, setPromotionsLoading] = useState(false)
  const [promotionsError, setPromotionsError] = useState('')
  const [quoteLoading, setQuoteLoading] = useState(false)
  const [quoteError, setQuoteError] = useState('')
  const [selectedGroupId, setSelectedGroupId] = useState('')
  const [parkingVehicleCount, setParkingVehicleCount] = useState(0)

  useEffect(() => {
    if (session) {
      /* eslint-disable react-hooks/set-state-in-effect */
      setPaymentMethod(session.customer.type === 'MEMBER' ? 'MEMBER' : 'CASH')
      setCart({})
      setPromotionRuleId('')
      setPromotions([])
      setPromotionsError('')
      const groups = session.pricingGroups ?? []
      const firstActive = groups.find(g => g.remainingCount > 0)
      setSelectedGroupId(firstActive?.id ?? '')
      setCheckoutPlayerCount(firstActive?.remainingCount ?? session.playerCount ?? 1)
      setParkingVehicleCount(0)
      /* eslint-enable react-hooks/set-state-in-effect */
    }
  }, [session])

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (!session) {
      setPlayQuote(null)
      setQuoteError('')
      return
    }

    let cancelled = false
    setPlayQuote(null)
    const loadQuote = async () => {
      setQuoteLoading(true)
      setQuoteError('')
      try {
      const params = new URLSearchParams()
      if (promotionRuleId) params.set('promotionRuleId', promotionRuleId)
      if (selectedGroupId) params.set('pricingGroupId', selectedGroupId)
      if (frozenAt) params.set('endTime', frozenAt)
      const qs = params.toString()
      const data = await apiJson<PlayTimeQuote>(`/api/sessions/${session.id}/checkout-preview${qs ? `?${qs}` : ''}`)
        if (!data.success || !data.data) {
          throw new Error(data.error || 'Không tính được tiền giờ chơi')
        }
        if (!cancelled) setPlayQuote(data.data)
      } catch (quoteLoadError) {
        if (!cancelled) setQuoteError((quoteLoadError as Error).message || 'Không tính được tiền giờ chơi')
      } finally {
        if (!cancelled) setQuoteLoading(false)
      }
    }

    void loadQuote()
    // Không poll nếu đã freeze thời gian — timer đã dừng
    if (!frozenAt) {
      const intervalId = window.setInterval(() => void loadQuote(), 30_000)
      return () => {
        cancelled = true
        window.clearInterval(intervalId)
      }
    }
    return () => { cancelled = true }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [session, promotionRuleId])

  useEffect(() => {
    if (!session || session.customer.type === 'MEMBER') return

    let cancelled = false
    const loadPromotions = async () => {
      setPromotionsLoading(true)
      setPromotionsError('')
      try {
        const data = await apiJson<PromotionSnapshot[]>('/api/promotions/available')
        if (!data.success) {
          throw new Error(data.error || 'Không tải được khuyến mại')
        }
        if (!cancelled) setPromotions(data.data ?? [])
      } catch (promotionLoadError) {
        if (!cancelled) {
          setPromotions([])
          setPromotionsError((promotionLoadError as Error).message || 'Không tải được khuyến mại')
        }
      } finally {
        if (!cancelled) setPromotionsLoading(false)
      }
    }

    void loadPromotions()
    return () => { cancelled = true }
  }, [session])

  const isMember = session?.customer.type === 'MEMBER'
  const sessionPlayerCount = session?.playerCount ?? 1
  const isGroupSession = sessionPlayerCount > 1
  const perPersonSubtotal = playQuote?.subtotal ?? 0
  const perPersonDiscount = playQuote?.discountAmount ?? 0
  const perPersonTotal = playQuote?.grandTotal ?? 0
  const playSubtotal = perPersonSubtotal * checkoutPlayerCount
  const playDiscount = perPersonDiscount * checkoutPlayerCount
  const playTotal = perPersonTotal * checkoutPlayerCount
  const pendingSellTotal = playQuote?.pendingSellTotal ?? 0
  const pendingSellItems = playQuote?.pendingSellItems ?? []
  const parkingFeeUnitPrice = playQuote?.parkingFeeUnitPrice ?? 0
  const parkingFeeTotal = parkingVehicleCount * parkingFeeUnitPrice

  const cartLines = products
    .map((product) => ({
      product,
      quantity: cart[product.id] ?? 0,
      total: (cart[product.id] ?? 0) * toNumber(product.price),
    }))
    .filter((line) => line.quantity > 0)

  const productSubtotal = cartLines.reduce((sum, line) => sum + line.total, 0)
  const grandTotal = Math.max(0, playTotal + pendingSellTotal + productSubtotal - parkingFeeTotal)

  const changeCart = (product: Product, delta: number) => {
    setCart((current) => {
      const currentQuantity = current[product.id] ?? 0
      const nextQuantity = currentQuantity + delta
      if (nextQuantity <= 0) {
        const next = { ...current }
        delete next[product.id]
        return next
      }
      if (product.type === 'PRODUCT' && nextQuantity > product.stockQuantity) return current
      return { ...current, [product.id]: nextQuantity }
    })
  }

  const handleCheckout = async () => {
    if (!session) return
    if (!shiftReady) {
      notifyError('Cần mở ca trước khi thu tiền')
      return
    }

    setSubmitting(true)
    try {
      const body: Record<string, unknown> = {
        paymentMethod,
        promotionRuleId: promotionRuleId || null,
        items: cartLines.map((line) => ({
          productId: line.product.id,
          quantity: line.quantity,
        })),
      }
      if (frozenAt) body.endTime = frozenAt
      // Nếu có pricing groups, gửi pricingGroupId
      const groups = session.pricingGroups ?? []
      if (selectedGroupId && groups.some(g => g.id === selectedGroupId)) {
        body.pricingGroupId = selectedGroupId
        body.playerCount = checkoutPlayerCount
      } else if (isGroupSession && checkoutPlayerCount < sessionPlayerCount) {
        body.playerCount = checkoutPlayerCount
      }
      if (parkingVehicleCount > 0) {
        body.parkingVehicleCount = parkingVehicleCount
      }
      const data = await apiJson<CheckoutResponse>(`/api/sessions/${session.id}/checkout`, jsonRequest(body))

      if (!data.success) {
        notifyError(data.error || 'Không checkout được')
        return
      }

      notifySuccess(`Đã thu ${money(data.data?.grandTotal ?? grandTotal)}`)
      await onDone()
    } catch {
      notifyError('Lỗi kết nối máy chủ')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={!!session}
      onClose={onClose}
      title={session ? `Thu tiền - ${session.customer.fullName}` : 'Thu tiền'}
      description={session
        ? `${isMember ? 'Hội viên' : 'Vãng lai'} · ${calcElapsedHMS(session.startTime, frozenAt ?? undefined)}${isGroupSession ? ` · ${sessionPlayerCount} người` : ''}`
        : undefined}
      size="lg"
      footer={
        <div className="space-y-3">
          {/* ── Bảng tổng kết ── */}
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950">
            {quoteLoading ? (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Đang tính tiền giờ chơi...</p>
            ) : quoteError ? (
              <p className="text-sm text-red-600 dark:text-red-300">{quoteError}</p>
            ) : (
              <>
                {isGroupSession ? (
                  <>
                    <InvoiceRow
                      label={`Giờ chơi (${checkoutPlayerCount} người × ${money(perPersonSubtotal)}/người)`}
                      value={money(playSubtotal)}
                    />
                    {perPersonDiscount > 0 && (
                      <div className="mt-2 flex justify-between gap-3 text-sm text-zinc-500 dark:text-zinc-400">
                        <span className="truncate">Giá mỗi người</span>
                        <span className="shrink-0 tabular-nums">{money(perPersonSubtotal)}</span>
                      </div>
                    )}
                  </>
                ) : (
                  <InvoiceRow
                    label={isMember ? 'Giờ chơi hội viên' : 'Giờ chơi vãng lai'}
                    value={money(playSubtotal)}
                  />
                )}
                {playQuote?.promotion && playDiscount > 0 && (
                  <div className="mt-2 flex justify-between gap-3 text-sm text-emerald-700 dark:text-emerald-300">
                    <span className="truncate">Khuyến mại · {playQuote.promotion.name}</span>
                    <span className="shrink-0 tabular-nums">-{money(playDiscount)}</span>
                  </div>
                )}
                {playDiscount > 0 && <InvoiceRow label="Tiền giờ chơi sau giảm" value={money(playTotal)} />}
              </>
            )}
            {pendingSellItems.length > 0 && (
              <div className="border-t border-dashed border-zinc-200 pt-3 dark:border-zinc-800">
                <p className="mb-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  Đã thêm vào phiên (chưa thu)
                </p>
                {pendingSellItems.map((item, index) => (
                  <InvoiceRow
                    key={`${item.productId}-${index}`}
                    label={`${item.productName} x${item.quantity}`}
                    value={money(item.subtotal)}
                  />
                ))}
              </div>
            )}
            {cartLines.map((line) => (
              <InvoiceRow
                key={line.product.id}
                label={`${line.product.name} x${line.quantity}`}
                value={money(line.total)}
              />
            ))}
            {parkingFeeTotal > 0 && (
              <InvoiceRow
                label="Phí gửi xe"
                value={`-${money(parkingFeeTotal)}`}
                warning
              />
            )}
          </div>
          <div className="flex items-center justify-between rounded-xl bg-zinc-100 px-4 py-3 dark:bg-zinc-800">
            <span className="text-sm font-semibold text-zinc-600 dark:text-zinc-300">Tổng thu</span>
            <span className="text-lg font-bold tabular-nums text-zinc-950 dark:text-white">
              {quoteError ? '—' : money(grandTotal)}
            </span>
          </div>
          <Button
            variant="inverse"
            size="lg"
            fullWidth
            disabled={submitting || !shiftReady || quoteLoading || !!quoteError || !playQuote}
            onClick={handleCheckout}
          >
            {submitting
              ? 'Đang thu tiền...'
              : selectedGroupId && checkoutPlayerCount < (session?.pricingGroups?.find(g => g.id === selectedGroupId)?.remainingCount ?? sessionPlayerCount)
                ? `Thu tiền ${checkoutPlayerCount} người`
                : (selectedGroupId && (session?.pricingGroups?.length ?? 0) > 0)
                  ? `Thu tiền (${session?.pricingGroups?.find(g => g.id === selectedGroupId)?.label ?? ''})`
                  : isGroupSession && checkoutPlayerCount < sessionPlayerCount
                    ? `Thu tiền ${checkoutPlayerCount} người`
                    : 'Thu tiền & kết thúc'}
          </Button>
        </div>
      }
    >
      {session && (
        <div className="space-y-4">
          {/* Group selection — chỉ khách vãng lai; hội viên không chia nhóm giá */}
          {!isMember && (session.pricingGroups?.length ?? 0) > 0 ? (
            <div className="space-y-2">
              <Label>Nhóm giá</Label>
              {session.pricingGroups!.filter(g => g.remainingCount > 0).map((g) => {
                const isSelected = selectedGroupId === g.id
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => {
                      setSelectedGroupId(g.id)
                      setCheckoutPlayerCount(g.remainingCount)
                    }}
                    className={`flex w-full items-center justify-between rounded-xl border p-3 text-left transition-colors ${
                      isSelected
                        ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10'
                        : 'border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900'
                    }`}
                  >
                    <div>
                      <p className="text-sm font-semibold text-zinc-950 dark:text-white">{g.label}</p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        {g.pricingSnapshot?.name ?? 'Bảng giá'} · {money(g.hourlyRate)}/giờ
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold tabular-nums text-zinc-950 dark:text-white">
                        {g.remainingCount} người
                      </p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        Còn {g.remainingCount}/{g.playerCount}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>
          ) : null}

          {/* Per-group checkout count stepper — chỉ khách vãng lai */}
          {!isMember && selectedGroupId && (session.pricingGroups?.length ?? 0) > 0 && (() => {
            const selectedGroup = session.pricingGroups!.find(g => g.id === selectedGroupId)
            if (!selectedGroup) return null
            const groupMax = selectedGroup.remainingCount
            return (
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950">
                <Label htmlFor="checkout-group-count">Số người checkout từ nhóm này</Label>
                <div className="mt-2 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setCheckoutPlayerCount((c) => Math.max(1, c - 1))}
                    disabled={checkoutPlayerCount <= 1}
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300"
                  >
                    <Minus size={14} />
                  </button>
                  <span className="text-lg font-bold tabular-nums text-zinc-950 dark:text-white">
                    {checkoutPlayerCount}
                  </span>
                  <button
                    type="button"
                    onClick={() => setCheckoutPlayerCount((c) => Math.min(groupMax, c + 1))}
                    disabled={checkoutPlayerCount >= groupMax}
                    className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-950 text-white disabled:opacity-40 dark:bg-white dark:text-zinc-950"
                  >
                    <Plus size={14} />
                  </button>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    / {groupMax} người trong nhóm
                  </span>
                </div>
                {checkoutPlayerCount < groupMax && (
                  <p className="mt-2 text-xs text-amber-600 dark:text-amber-300">
                    Checkout {checkoutPlayerCount} người — nhóm còn {groupMax - checkoutPlayerCount} người tiếp tục chơi
                  </p>
                )}
              </div>
            )
          })()}

          {!isMember && isGroupSession && !selectedGroupId && (
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950">
              <Label htmlFor="checkout-player-count">Số người checkout</Label>
              <div className="mt-2 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setCheckoutPlayerCount((c) => Math.max(1, c - 1))}
                  disabled={checkoutPlayerCount <= 1}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300"
                >
                  <Minus size={14} />
                </button>
                <span className="text-lg font-bold tabular-nums text-zinc-950 dark:text-white">
                  {checkoutPlayerCount}
                </span>
                <button
                  type="button"
                  onClick={() => setCheckoutPlayerCount((c) => Math.min(sessionPlayerCount, c + 1))}
                  disabled={checkoutPlayerCount >= sessionPlayerCount}
                  className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-950 text-white disabled:opacity-40 dark:bg-white dark:text-zinc-950"
                >
                  <Plus size={14} />
                </button>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  / {sessionPlayerCount} người trong phiên
                </span>
              </div>
              {checkoutPlayerCount < sessionPlayerCount && (
                <p className="mt-2 text-xs text-amber-600 dark:text-amber-300">
                  Checkout {checkoutPlayerCount} người — phiên còn {sessionPlayerCount - checkoutPlayerCount} người tiếp tục chơi
                </p>
              )}
            </div>
          )}

          {!isMember && (
            <div>
              <Label htmlFor="checkout-promotion">Khuyến mại giờ chơi</Label>
              <Select
                id="checkout-promotion"
                value={promotionRuleId}
                disabled={promotionsLoading}
                onChange={(event) => setPromotionRuleId(event.target.value)}
              >
                <option value="">Không áp dụng khuyến mại</option>
                {promotions.map((promotion) => (
                  <option key={promotion.ruleId} value={promotion.ruleId}>
                    {formatPromotionOption(promotion)}
                  </option>
                ))}
              </Select>
              {promotionsError ? (
                <p className="mt-1 text-xs text-red-600 dark:text-red-300">{promotionsError}</p>
              ) : (
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  Chọn một khuyến mại còn hiệu lực tại thời điểm thu tiền.
                </p>
              )}
            </div>
          )}

          {/* Phí gửi xe (trừ vào tổng thanh toán) — chỉ khách vãng lai */}
          {!isMember && parkingFeeUnitPrice > 0 && (
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950">
              <div className="flex items-center justify-between">
                <Label>Phí gửi xe</Label>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  {money(parkingFeeUnitPrice)}/xe
                </span>
              </div>
              <div className="mt-2 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setParkingVehicleCount((c) => Math.max(0, c - 1))}
                  disabled={parkingVehicleCount === 0}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300"
                >
                  <Minus size={14} />
                </button>
                <span className="text-lg font-bold tabular-nums text-zinc-950 dark:text-white">
                  {parkingVehicleCount}
                </span>
                <button
                  type="button"
                  onClick={() => setParkingVehicleCount((c) => Math.min(20, c + 1))}
                  className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-950 text-white disabled:opacity-40 dark:bg-white dark:text-zinc-900"
                >
                  <Plus size={14} />
                </button>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">xe</span>
              </div>
              {parkingVehicleCount > 0 && (
                <div className="mt-2 flex justify-between text-sm">
                  <span className="text-red-500 dark:text-red-300">Tạm tính trừ</span>
                  <span className="font-semibold text-red-600 dark:text-red-300 tabular-nums">
                    -{money(parkingFeeTotal)}
                  </span>
                </div>
              )}
            </div>
          )}

          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label>Đồ uống / dịch vụ</Label>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                {cartLines.length} món
              </span>
            </div>
            <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {products.length === 0 ? (
                <p className="rounded-lg bg-zinc-50 p-3 text-sm text-zinc-500 dark:bg-zinc-950 dark:text-zinc-400">
                  Chưa có sản phẩm hoặc dịch vụ.
                </p>
              ) : (
                products.map((product) => {
                  const quantity = cart[product.id] ?? 0
                  const outOfStock = product.type === 'PRODUCT' && product.stockQuantity <= 0
                  return (
                    <div
                      key={product.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-800"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-zinc-950 dark:text-white">
                          {product.name}
                        </p>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">
                          {money(product.price)}
                          {product.type === 'PRODUCT' ? ` · còn ${product.stockQuantity}` : ' · dịch vụ'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => changeCart(product, -1)}
                          disabled={quantity === 0}
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300"
                        >
                          <Minus size={14} />
                        </button>
                        <span className="w-5 text-center text-sm tabular-nums text-zinc-950 dark:text-white">
                          {quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => changeCart(product, 1)}
                          disabled={outOfStock}
                          className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-950 text-white disabled:opacity-40 dark:bg-white dark:text-zinc-950"
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>

          {isMember ? (
            <div>
              <Label>Phương thức thanh toán</Label>
              <div className="flex items-center justify-between rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950">
                <span className="text-sm font-medium text-zinc-950 dark:text-white">
                  {paymentMethodLabel('MEMBER')}
                </span>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  Không thu tiền mặt tại quầy
                </span>
              </div>
            </div>
          ) : (
            <div>
              <Label htmlFor="payment-method">Phương thức thanh toán</Label>
              <Select
                id="payment-method"
                value={paymentMethod}
                onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod)}
              >
                <option value="CASH">{paymentMethodLabel('CASH')}</option>
                <option value="TRANSFER">{paymentMethodLabel('TRANSFER')}</option>
                <option value="CARD">{paymentMethodLabel('CARD')}</option>
              </Select>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}



