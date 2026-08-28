'use client'

import { useCallback, useEffect, useState } from 'react'
import { Modal } from '@/components/ui/modal'
import { Skeleton, SkeletonPanel } from '@/components/ui/skeleton'
import { NoticeCard } from '@/components/ui/notice-card'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { ReceiptText } from 'lucide-react'
import { InvoiceDetailContent, type InvoiceDetail } from './invoice-detail-content'

interface InvoiceDetailModalProps {
  invoiceId: string
  open: boolean
  onClose: () => void
}

export function InvoiceDetailModal({ invoiceId, open, onClose }: InvoiceDetailModalProps) {
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadInvoice = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`/api/invoices/${invoiceId}`)
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
  }, [invoiceId])

  useEffect(() => {
    if (open) {
      setInvoice(null)
      setError('')
      void loadInvoice()
    }
  }, [open, loadInvoice])

  if (!open) return null

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={invoice ? invoice.invoiceNo : 'Chi tiết hoá đơn'}
      description={invoice ? `${invoice.staff.fullName} · ${invoice.customer?.fullName ?? 'Khách lẻ'}` : undefined}
    >
      {loading ? (
        <div className="space-y-4">
          <SkeletonPanel><Skeleton className="h-32 w-full" /></SkeletonPanel>
          <div className="grid grid-cols-2 gap-3">
            <SkeletonPanel><Skeleton className="h-24 w-full" /></SkeletonPanel>
            <SkeletonPanel><Skeleton className="h-24 w-full" /></SkeletonPanel>
          </div>
          <SkeletonPanel><Skeleton className="h-48 w-full" /></SkeletonPanel>
          <SkeletonPanel><Skeleton className="h-32 w-full" /></SkeletonPanel>
        </div>
      ) : error ? (
        <NoticeCard
          tone="danger"
          title="Không tải được dữ liệu"
          description={error}
          action={<Button variant="secondary" size="sm" onClick={loadInvoice}>Thử lại</Button>}
        />
      ) : invoice ? (
        <InvoiceDetailContent invoice={invoice} />
      ) : (
        <EmptyState
          icon={ReceiptText}
          message="Không tìm thấy hoá đơn"
          description="Hoá đơn không tồn tại hoặc bạn không có quyền xem."
        />
      )}
    </Modal>
  )
}
