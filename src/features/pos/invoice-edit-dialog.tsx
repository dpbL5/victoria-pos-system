'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Car,
  Minus,
  Plus,
  ShieldCheck,
  ShoppingBag,
  Tag,
  Timer,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Label, Select, Textarea } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { NoticeCard } from '@/components/ui/notice-card'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/components/ui/toast'
import { apiJson, jsonRequest } from './api'
import { money, paymentMethodLabel, toNumber } from './format'
import type { InvoiceDetail } from './invoice-detail-content'
import type { PaymentMethod, Product } from './types'

// ── Types ───────────────────────────────────────────────

interface EditableLine {
  productId: string
  name: string
  type: string
  stockQuantity: number
  quantity: number
  unitPrice: number
}

interface EditResult {
  invoiceId: string
  invoiceNo: string
  grandTotal: number
}

// (giữ EditResult để khớp response từ API nhưng không cần redirect nữa)

// ── Helpers ─────────────────────────────────────────────

const LINE_TYPE_ICONS: Record<string, React.ElementType> = {
  PLAY_TIME: Timer,
  MEMBERSHIP_FEE: ShieldCheck,
  PRODUCT: ShoppingBag,
  SERVICE: ShoppingBag,
  DISCOUNT: Tag,
  SURCHARGE: Car,
}

const LINE_TYPE_LABELS: Record<string, string> = {
  PLAY_TIME: 'Giờ chơi',
  MEMBERSHIP_FEE: 'Phí hội viên',
  PRODUCT: 'Hàng hoá',
  SERVICE: 'Dịch vụ',
  DISCOUNT: 'Giảm giá',
  SURCHARGE: 'Phí gửi xe',
}

function isProductLine(type: string) {
  return type === 'PRODUCT' || type === 'SERVICE'
}

// ── Component ───────────────────────────────────────────

interface Props {
  invoice: InvoiceDetail | null
  open: boolean
  submitting: boolean
  setSubmitting: (v: boolean) => void
  onClose: () => void
  onSaved: () => void
}

export function InvoiceEditDialog({
  invoice,
  open,
  submitting,
  setSubmitting,
  onClose,
  onSaved,
}: Props) {
  const { success: notifySuccess, error: notifyError } = useToast()

  const [products, setProducts] = useState<Product[]>([])
  const [productsLoading, setProductsLoading] = useState(false)

  const [lines, setLines] = useState<EditableLine[]>([])
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH')
  const [notes, setNotes] = useState('')

  // ── Hydrate on open ──
  useEffect(() => {
    if (!open || !invoice) return
    /* eslint-disable react-hooks/set-state-in-effect */

    // Seed editable lines from existing PRODUCT/SERVICE items
    const seeded: EditableLine[] = []
    for (const item of invoice.items) {
      if (item.product && isProductLine(item.type)) {
        seeded.push({
          productId: item.product.id,
          name: item.description || item.product.name,
          type: item.type,
          stockQuantity: 0, // will be filled from products fetch
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        })
      }
    }
    setLines(seeded)

    setPaymentMethod(
      (invoice.payments[0]?.paymentMethod as PaymentMethod) ?? 'CASH'
    )
    setNotes(invoice.notes ?? '')

    // Fetch products
    setProductsLoading(true)
    apiJson<Product[]>('/api/products?isActive=true')
      .then((data) => {
        if (data.success) {
          setProducts(data.data ?? [])
        }
      })
      .catch(() => { /* bỏ qua */ })
      .finally(() => setProductsLoading(false))
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open, invoice])

  // ── Derived ──
  const lockedLines = invoice
    ? invoice.items.filter(
        (item) => !item.product || !isProductLine(item.type)
      )
    : []

  const lockedTotal = lockedLines.reduce(
    (sum, line) => sum + toNumber(line.total),
    0
  )

  const productSubtotal = lines.reduce(
    (sum, line) => sum + line.quantity * line.unitPrice,
    0
  )

  const grandTotal =
    lockedTotal + productSubtotal - toNumber(invoice?.discountTotal)

  // ── Line mutations ──
  const updateQuantity = useCallback(
    (index: number, delta: number) => {
      setLines((prev) =>
        prev.map((line, i) => {
          if (i !== index) return line
          const next = line.quantity + delta
          if (next < 1) return line
          if (line.type === 'PRODUCT' && next > line.stockQuantity) return line
          return { ...line, quantity: next }
        })
      )
    },
    []
  )

  const removeLine = useCallback((index: number) => {
    setLines((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const addProduct = useCallback((product: Product) => {
    setLines((prev) => {
      const existing = prev.findIndex((l) => l.productId === product.id)
      if (existing >= 0) {
        return prev.map((line, i) => {
          if (i !== existing) return line
          const nextQty = line.quantity + 1
          if (product.type === 'PRODUCT' && nextQty > product.stockQuantity)
            return line
          return { ...line, quantity: nextQty }
        })
      }
      return [
        ...prev,
        {
          productId: product.id,
          name: product.name,
          type: product.type,
          stockQuantity: product.stockQuantity,
          quantity: 1,
          unitPrice: toNumber(product.price),
        },
      ]
    })
  }, [])

  // ── Submit ──
  const handleSave = async () => {
    if (!invoice) return
    setSubmitting(true)
    try {
      const data = await apiJson<EditResult>(
        `/api/invoices/${invoice.id}/edit`,
        jsonRequest({
          items: lines.map((l) => ({
            productId: l.productId,
            quantity: l.quantity,
          })),
          paymentMethod,
          notes: notes.trim() || null,
        })
      )
      if (!data.success || !data.data) {
        notifyError(data.error || 'Không sửa được hoá đơn')
        return
      }
      notifySuccess('Đã sửa hoá đơn')
      onSaved()
    } catch {
      notifyError('Lỗi kết nối máy chủ')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Available products (not yet in lines, with stock) ──
  const addedProductIds = new Set(lines.map((l) => l.productId))
  const availableProducts = products.filter(
    (p) =>
      !addedProductIds.has(p.id) &&
      (p.type === 'SERVICE' || p.stockQuantity > 0)
  )

  const memberCustomer = invoice?.customer?.type === 'MEMBER'

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Sửa hoá đơn ${invoice?.invoiceNo ?? ''}`}
      description="Sửa nội dung hoá đơn — hoá đơn cũ được đánh dấu đã huỷ, tạo hoá đơn mới với nội dung sửa."
      size="lg"
      footer={
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-xl bg-zinc-100 px-4 py-3 dark:bg-zinc-800">
            <span className="text-sm font-semibold text-zinc-600 dark:text-zinc-300">
              Tổng sau sửa
            </span>
            <span className="text-lg font-bold tabular-nums text-zinc-950 dark:text-white">
              {money(grandTotal)}
            </span>
          </div>
          <Button
            variant="inverse"
            size="lg"
            fullWidth
            disabled={submitting}
            onClick={handleSave}
          >
            {submitting ? 'Đang lưu...' : 'Lưu'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <NoticeCard
          tone="warning"
          title="Lưu ý"
          description="Hoá đơn sẽ được sửa trực tiếp — items, tồn kho và thanh toán được cập nhật. Hành động được ghi vào nhật ký kiểm toán."
        />

        {/* Locked lines */}
        {lockedLines.length > 0 && (
          <div className="space-y-2">
            <Label>Các mục giữ nguyên</Label>
            {lockedLines.map((line) => {
              const Icon = LINE_TYPE_ICONS[line.type] ?? ShoppingBag
              return (
                <div
                  key={line.id}
                  className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950"
                >
                  <Icon size={16} className="shrink-0 text-zinc-400" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-zinc-700 dark:text-zinc-200">
                      {LINE_TYPE_LABELS[line.type] ?? line.type}:{' '}
                      {line.description}
                    </p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      {line.quantity} × {money(line.unitPrice)}
                      {toNumber(line.discountAmount) > 0 &&
                        ` (-${money(line.discountAmount)})`}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-zinc-600 dark:text-zinc-300">
                    {money(line.total)}
                  </span>
                  <span className="shrink-0 text-xs text-zinc-400 dark:text-zinc-500">
                    giữ nguyên
                  </span>
                </div>
              )
            })}
          </div>
        )}

        {/* Editable lines */}
        {lines.length > 0 && (
          <div className="space-y-2">
            <Label>Hàng hoá / dịch vụ (có thể sửa)</Label>
            {lines.map((line, index) => (
              <div
                key={line.productId}
                className="flex items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-800"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-zinc-950 dark:text-white">
                    {line.name}
                  </p>
                  <div className="mt-1 flex items-center gap-3">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => updateQuantity(index, -1)}
                        disabled={line.quantity <= 1}
                        className="flex h-7 w-7 items-center justify-center rounded border border-zinc-200 text-zinc-600 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300"
                      >
                        <Minus size={12} />
                      </button>
                      <span className="w-6 text-center text-sm tabular-nums text-zinc-950 dark:text-white">
                        {line.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateQuantity(index, 1)}
                        disabled={
                          line.type === 'PRODUCT' &&
                          line.quantity >= line.stockQuantity
                        }
                        className="flex h-7 w-7 items-center justify-center rounded bg-zinc-950 text-white disabled:opacity-40 dark:bg-white dark:text-zinc-950"
                      >
                        <Plus size={12} />
                      </button>
                    </div>
                    <span className="text-xs text-zinc-500">× {money(line.unitPrice)}</span>
                  </div>
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-zinc-950 dark:text-white">
                  {money(line.quantity * line.unitPrice)}
                </span>
                <button
                  type="button"
                  onClick={() => removeLine(index)}
                  className="shrink-0 rounded p-1 text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950 dark:hover:text-red-400"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Product picker */}
        <div className="space-y-2">
          <Label>Thêm sản phẩm / dịch vụ</Label>
          {productsLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : availableProducts.length === 0 ? (
            <p className="rounded-lg bg-zinc-50 p-3 text-sm text-zinc-500 dark:bg-zinc-950 dark:text-zinc-400">
              {products.length === 0
                ? 'Chưa có sản phẩm hoặc dịch vụ.'
                : 'Tất cả sản phẩm đã được thêm hoặc hết hàng.'}
            </p>
          ) : (
            <div className="max-h-48 space-y-1 overflow-y-auto pr-1">
              {availableProducts.map((product) => {
                const outOfStock =
                  product.type === 'PRODUCT' && product.stockQuantity <= 0
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
                        {product.type === 'PRODUCT'
                          ? ` · còn ${product.stockQuantity}`
                          : ' · dịch vụ'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => addProduct(product)}
                      disabled={outOfStock}
                      className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-950 text-white disabled:opacity-40 dark:bg-white dark:text-zinc-950"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Payment method */}
        <div>
          <Label htmlFor="edit-payment-method">Phương thức thanh toán</Label>
          <Select
            id="edit-payment-method"
            value={paymentMethod}
            onChange={(e) =>
              setPaymentMethod(e.target.value as PaymentMethod)
            }
          >
            <option value="CASH">{paymentMethodLabel('CASH')}</option>
            <option value="TRANSFER">{paymentMethodLabel('TRANSFER')}</option>
            <option value="CARD">{paymentMethodLabel('CARD')}</option>
            {memberCustomer && (
              <option value="MEMBER">{paymentMethodLabel('MEMBER')}</option>
            )}
          </Select>
        </div>

        {/* Notes */}
        <div>
          <Label htmlFor="edit-notes">Ghi chú</Label>
          <Textarea
            id="edit-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={500}
            placeholder="Ghi chú cho hoá đơn sửa"
          />
        </div>
      </div>
    </Modal>
  )
}
