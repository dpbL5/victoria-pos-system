'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ReceiptText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { InvoiceDetailContent, type InvoiceDetail } from './invoice-detail-content'

interface Props {
  id: string
}

export function TransactionDetailScreen({ id }: Props) {
  const router = useRouter()
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadInvoice = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`/api/invoices/${id}`)
      const data = await response.json()
      if (!data.success) {
        setError(data.error || 'Không tải được hoá đơn')
        return
      }
      setInvoice(data.data)
    } catch {
      setError('Lỗi kết nối máy chủ')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void loadInvoice(), 0)
    return () => window.clearTimeout(timeoutId)
  }, [loadInvoice])

  if (loading) {
    return (
      <div className="min-h-full bg-zinc-50 px-4 py-4 dark:bg-zinc-950 md:px-6 md:py-6">
        <div className="mx-auto max-w-2xl space-y-4">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-32 w-full" />
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    )
  }

  if (error || !invoice) {
    return (
      <div className="min-h-full bg-zinc-50 px-4 py-4 dark:bg-zinc-950 md:px-6 md:py-6">
        <Button variant="ghost" size="sm" icon={ArrowLeft} onClick={() => router.back()}>
          Quay lại
        </Button>
        <div className="mt-12">
          <EmptyState
            icon={ReceiptText}
            message={error || 'Không tìm thấy hoá đơn'}
            description="Hoá đơn không tồn tại hoặc bạn không có quyền xem."
          />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-full bg-zinc-50 px-4 py-4 dark:bg-zinc-950 md:px-6 md:py-6">
      <div className="mx-auto max-w-2xl">
        <Button variant="ghost" size="sm" icon={ArrowLeft} onClick={() => router.back()} className="mb-4">
          Quay lại
        </Button>
        <InvoiceDetailContent invoice={invoice} />
      </div>
    </div>
  )
}
