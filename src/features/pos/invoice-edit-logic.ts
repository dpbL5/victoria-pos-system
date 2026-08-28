'use client'

import { useCallback, useEffect, useState } from 'react'
import { useToast } from '@/components/ui/toast'
import { apiJson, jsonRequest } from '@/lib/api'
import { toNumber } from './format'
import type { InvoiceDetail } from './invoice-detail-content'
import type { PaymentMethod, Product } from './types'

export interface InvoiceEditorLine {
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

function isProductLine(type: string) {
  return type === 'PRODUCT' || type === 'SERVICE'
}

export function useInvoiceEditLogic({
  invoice,
  active,
  setSubmitting,
  onSaved,
}: {
  invoice: InvoiceDetail
  active: boolean
  setSubmitting: (value: boolean) => void
  onSaved: () => void
}) {
  const { success: notifySuccess, error: notifyError } = useToast()
  const [products, setProducts] = useState<Product[]>([])
  const [productsLoading, setProductsLoading] = useState(false)
  const [lines, setLines] = useState<InvoiceEditorLine[]>([])
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (!active) return

    const seeded: InvoiceEditorLine[] = invoice.items.flatMap((item) =>
      item.product && isProductLine(item.type)
        ? [{
            productId: item.product.id,
            name: item.description || item.product.name,
            type: item.type,
            stockQuantity: 0,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
          }]
        : []
    )
    setLines(seeded)
    setPaymentMethod((invoice.payments[0]?.paymentMethod as PaymentMethod) ?? 'CASH')
    setNotes(invoice.notes ?? '')

    setProductsLoading(true)
    apiJson<Product[]>('/api/products?isActive=true')
      .then((data) => {
        if (!data.success) return
        const nextProducts = data.data ?? []
        setProducts(nextProducts)
        setLines((current) => current.map((line) => ({
          ...line,
          stockQuantity: nextProducts.find((product) => product.id === line.productId)?.stockQuantity ?? 0,
        })))
      })
      .catch(() => undefined)
      .finally(() => setProductsLoading(false))
  }, [active, invoice])

  const lockedTotal = invoice.items
    .filter((item) => !item.product || !isProductLine(item.type))
    .reduce((sum, item) => sum + toNumber(item.total), 0)
  const productSubtotal = lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0)
  const grandTotal = lockedTotal + productSubtotal - toNumber(invoice.discountTotal)

  const updateQuantity = useCallback((productId: string, delta: number) => {
    setLines((current) => current.map((line) => {
      if (line.productId !== productId) return line
      const next = line.quantity + delta
      if (next < 1) return line
      if (line.type === 'PRODUCT' && next > line.stockQuantity) return line
      return { ...line, quantity: next }
    }))
  }, [])

  const removeLine = useCallback((productId: string) => {
    setLines((current) => current.filter((line) => line.productId !== productId))
  }, [])

  const addProduct = useCallback((product: Product) => {
    setLines((current) => {
      const existing = current.find((line) => line.productId === product.id)
      if (existing) {
        const nextQuantity = existing.quantity + 1
        if (product.type === 'PRODUCT' && nextQuantity > product.stockQuantity) return current
        return current.map((line) => line.productId === product.id
          ? { ...line, quantity: nextQuantity }
          : line)
      }
      return [...current, {
        productId: product.id,
        name: product.name,
        type: product.type,
        stockQuantity: product.stockQuantity,
        quantity: 1,
        unitPrice: toNumber(product.price),
      }]
    })
  }, [])

  const handleSave = async () => {
    setSubmitting(true)
    try {
      const data = await apiJson<EditResult>(
        `/api/invoices/${invoice.id}/edit`,
        jsonRequest({
          items: lines.map((line) => ({ productId: line.productId, quantity: line.quantity })),
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

  const lockedLines = invoice.items.filter(
    (item) => !item.product || !isProductLine(item.type)
  )
  const availableProducts = products.filter(
    (product) => !lines.some((line) => line.productId === product.id)
      && (product.type === 'SERVICE' || product.stockQuantity > 0)
  )

  return {
    availableProducts,
    grandTotal,
    handleSave,
    lines,
    lockedLines,
    productsLoading,
    addProduct,
    paymentMethod,
    removeLine,
    setNotes,
    setPaymentMethod,
    notes,
    updateQuantity,
  }
}
