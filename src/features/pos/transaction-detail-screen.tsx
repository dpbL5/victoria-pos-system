'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Pencil, ReceiptText, Trash2, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Label, Textarea } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { apiJson, jsonRequest } from '@/lib/api'
import type { UserSession } from '@/features/pos/types'
import { InvoiceDetailContent, type InvoiceDetail } from './invoice-detail-content'
import { InvoiceEditDialog } from './invoice-edit-dialog'

interface Props {
  id: string
}

export function TransactionDetailScreen({ id }: Props) {
  const router = useRouter()
  const { success: notifySuccess, error: notifyError } = useToast()
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null)
  const [user, setUser] = useState<UserSession | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmVoidOpen, setConfirmVoidOpen] = useState(false)
  const [voiding, setVoiding] = useState(false)
  const [voidReason, setVoidReason] = useState('')
  const [editOpen, setEditOpen] = useState(false)
  const [editing, setEditing] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [invoiceRes, userRes] = await Promise.all([
        fetch(`/api/invoices/${id}`).then((res) => res.json()),
        apiJson<UserSession>('/api/auth/me'),
      ])
      if (!invoiceRes.success) {
        setError(invoiceRes.error || 'Không tải được hoá đơn')
        return
      }
      setInvoice(invoiceRes.data)
      if (userRes.success) setUser(userRes.data ?? null)
    } catch {
      setError('Lỗi kết nối máy chủ')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void loadData(), 0)
    return () => window.clearTimeout(timeoutId)
  }, [loadData])

  const isAdmin = user?.role === 'ADMIN'

  const handleDeleteConfirm = async () => {
    if (!invoice) return
    setDeleting(true)
    try {
      const data = await apiJson(`/api/invoices/${id}`, { method: 'DELETE' })
      if (!data.success) {
        notifyError(data.error || 'Không xoá được hoá đơn')
        return
      }
      notifySuccess('Đã xoá hoá đơn')
      setConfirmDeleteOpen(false)
      router.back()
    } catch {
      notifyError('Lỗi kết nối máy chủ')
    } finally {
      setDeleting(false)
    }
  }

  const handleVoidConfirm = async () => {
    if (!invoice) return
    setVoiding(true)
    try {
      const data = await apiJson(
        `/api/invoices/${id}/void`,
        jsonRequest({ reason: voidReason })
      )
      if (!data.success) {
        notifyError(data.error || 'Không huỷ được hoá đơn')
        return
      }
      notifySuccess('Đã huỷ hoá đơn')
      setConfirmVoidOpen(false)
      setVoidReason('')
      void loadData()
    } catch {
      notifyError('Lỗi kết nối máy chủ')
    } finally {
      setVoiding(false)
    }
  }

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
        <div className="mb-4 flex items-center justify-between">
          <Button variant="ghost" size="sm" icon={ArrowLeft} onClick={() => router.back()}>
            Quay lại
          </Button>
          {isAdmin && invoice && (
            <>
              {invoice.status === 'PAID' && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={Pencil}
                    title="Sửa hoá đơn"
                    onClick={() => setEditOpen(true)}
                  >
                    Sửa
                  </Button>
                  <Button
                    variant="outline-danger"
                    size="sm"
                    icon={XCircle}
                    title="Huỷ hoá đơn"
                    onClick={() => setConfirmVoidOpen(true)}
                  >
                    Huỷ
                  </Button>
                </>
              )}
              {invoice.status === 'DRAFT' && (
                <Button
                  variant="outline-danger"
                  size="sm"
                  icon={Trash2}
                  title="Xoá hoá đơn"
                  onClick={() => setConfirmDeleteOpen(true)}
                >
                  Xoá
                </Button>
              )}
            </>
          )}
        </div>
        <InvoiceDetailContent invoice={invoice} />
      </div>

      <ConfirmDialog
        open={confirmDeleteOpen}
        onClose={() => setConfirmDeleteOpen(false)}
        title="Xoá hoá đơn"
        description={invoice ? `Bạn có chắc muốn xoá hoá đơn "${invoice.invoiceNo}" không?` : undefined}
        body={
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Hành động này không thể hoàn tác. Chỉ xoá được hoá đơn chưa có thanh toán, phí hội viên
            hoặc biến động tồn kho liên quan.
          </p>
        }
        confirmLabel="Xoá hoá đơn"
        cancelLabel="Hủy"
        submitting={deleting}
        onConfirm={handleDeleteConfirm}
      />

      <ConfirmDialog
        open={confirmVoidOpen}
        onClose={() => {
          setConfirmVoidOpen(false)
          setVoidReason('')
        }}
        title="Huỷ hoá đơn"
        description={invoice ? `Xác nhận huỷ hoá đơn "${invoice.invoiceNo}"? Tiền và tồn kho sẽ được hoàn trả.` : undefined}
        body={
          <div className="space-y-2">
            <Label htmlFor="void-reason">Lý do (tùy chọn)</Label>
            <Textarea
              id="void-reason"
              rows={3}
              placeholder="Ví dụ: khách hàng thanh toán nhầm"
              value={voidReason}
              onChange={(event) => setVoidReason(event.target.value)}
              maxLength={500}
            />
          </div>
        }
        confirmLabel="Huỷ hoá đơn"
        cancelLabel="Hủy"
        submitting={voiding}
        onConfirm={handleVoidConfirm}
      />

      <InvoiceEditDialog
        invoice={invoice}
        open={editOpen}
        submitting={editing}
        setSubmitting={setEditing}
        onClose={() => setEditOpen(false)}
        onSaved={() => {
          setEditOpen(false)
          void loadData()
        }}
      />
    </div>
  )
}
