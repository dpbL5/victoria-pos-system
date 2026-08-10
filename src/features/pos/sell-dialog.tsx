'use client'

import { useEffect, useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { useToast } from '@/components/ui/toast'
import { apiJson, jsonRequest } from '@/lib/api'
import { money, toNumber } from './format'
import type { Product, SessionRow } from './types'

export function SellDialog({
  session,
  products,
  shiftReady,
  submitting,
  setSubmitting,
  onClose,
  onDone,
}: {
  session: SessionRow | null
  products: Product[]
  shiftReady: boolean
  submitting: boolean
  setSubmitting: (value: boolean) => void
  onClose: () => void
  onDone: () => Promise<void>
}) {
  const { success: notifySuccess, error: notifyError } = useToast()
  const [cart, setCart] = useState<Record<string, number>>({})

  useEffect(() => {
    if (session) {
      /* eslint-disable react-hooks/set-state-in-effect */
      setCart({})
      /* eslint-enable react-hooks/set-state-in-effect */
    }
  }, [session])

  const cartLines = products
    .map((product) => ({
      product,
      quantity: cart[product.id] ?? 0,
      total: (cart[product.id] ?? 0) * toNumber(product.price),
    }))
    .filter((line) => line.quantity > 0)

  const grandTotal = cartLines.reduce((sum, line) => sum + line.total, 0)

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

  const handleSell = async () => {
    if (!session) return
    if (!shiftReady) {
      notifyError('Cần mở ca trước khi thêm vào phiên')
      return
    }
    if (cartLines.length === 0) {
      notifyError('Chưa chọn sản phẩm hoặc dịch vụ')
      return
    }

    setSubmitting(true)
    try {
      const data = await apiJson(`/api/sessions/${session.id}/sell`, jsonRequest({
        items: cartLines.map((line) => ({
          productId: line.product.id,
          quantity: line.quantity,
        })),
      }))

      if (!data.success) {
        notifyError(data.error || 'Không thêm được vào phiên')
        return
      }

      notifySuccess(`Đã thêm ${money(grandTotal)} vào phiên`)
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
      title={session ? `Bán kèm - ${session.customerName ?? session.customer?.fullName ?? 'Khách lẻ'}` : 'Bán kèm'}
      description="Thêm đồ uống / dịch vụ vào phiên. Tiền sẽ được tính khi thu."
      size="lg"
      footer={
        <Button
          variant="primary"
          size="lg"
          fullWidth
          disabled={submitting || !shiftReady || cartLines.length === 0}
          onClick={handleSell}
        >
          {submitting ? 'Đang xử lý...' : `Thêm vào phiên ${money(grandTotal)}`}
        </Button>
      }
    >
      {session && (
        <div className="space-y-4">
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
        </div>
      )}
    </Modal>
  )
}
