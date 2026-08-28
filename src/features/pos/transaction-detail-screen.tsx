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
import { isAdminOnly } from '@/lib/shared/roles'
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

  const isAdmin = isAdminOnly(user?.role)

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
      <div className="min-h-full bg-[var(--color-surface-secondary)] px-4 py-6 dark:bg-black md:px-8 md:py-10">
        <div className="mx-auto max-w-6xl space-y-6">
          <Skeleton className="h-9 w-24" />
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <Skeleton className="h-[600px]" />
            <div className="space-y-6">
              <Skeleton className="h-32" />
              <Skeleton className="h-32" />
              <Skeleton className="h-24" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (error || !invoice) {
    return (
      <div className="min-h-full bg-[var(--color-surface-secondary)] px-4 py-6 dark:bg-black md:px-8 md:py-10">
        <div className="mx-auto max-w-6xl space-y-6">
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
      </div>
    )
  }

  return (
    <div className="min-h-full bg-[var(--color-surface-secondary)] px-4 py-6 dark:bg-black md:px-8 md:py-10">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* ── Folio chrome ── */}
        <div className="flex items-center justify-between gap-3">
          <Button
            variant="ghost"
            size="sm"
            icon={ArrowLeft}
            onClick={() => router.back()}
          >
            Quay lại
          </Button>

          {isAdmin && (
            <div className="flex items-center gap-2">
              {invoice.status === 'PAID' && (
                <>
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={Pencil}
                    onClick={() => setEditOpen(true)}
                  >
                    Sửa
                  </Button>
                  <Button
                    variant="outline-danger"
                    size="sm"
                    icon={XCircle}
                    onClick={() => setConfirmVoidOpen(true)}
                  >
                    Huỷ hoá đơn
                  </Button>
                </>
              )}
              {invoice.status === 'DRAFT' && (
                <Button
                  variant="outline-danger"
                  size="sm"
                  icon={Trash2}
                  onClick={() => setConfirmDeleteOpen(true)}
                >
                  Xoá
                </Button>
              )}
            </div>
          )}
        </div>

        {/* ── Receipt folio + spine ── */}
        <InvoiceDetailContent invoice={invoice} />
      </div>

      <ConfirmDialog
        open={confirmDeleteOpen}
        onClose={() => setConfirmDeleteOpen(false)}
        title="Xoá hoá đơn"
        description={invoice ? `Bạn có chắc muốn xoá hoá đơn "${invoice.invoiceNo}" không?` : undefined}
        body={
          <p className="text-sm text-[var(--color-text-secondary)]">
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
