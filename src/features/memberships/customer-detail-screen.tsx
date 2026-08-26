'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  History,
  Pencil,
  Phone,
  ReceiptText,
  Save,
  Trash2,
  User,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Input, Label, Textarea } from '@/components/ui/input'
import { NoticeCard } from '@/components/ui/notice-card'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/components/ui/toast'
import { isManagerOrAdmin } from '@/lib/shared/roles'
import { apiJson, jsonRequest } from '@/lib/api'
import { money, formatDay } from '@/features/pos/format'
import type { UserSession } from '@/features/pos/types'

interface Props {
  id: string
}

interface CustomerHistoryInvoice {
  id: string
  invoiceNo: string
  status: 'DRAFT' | 'PAID' | 'CANCELLED'
  grandTotal: number | string
  paidAt: string | null
  createdAt: string
  staff: { id: string; fullName: string } | null
  shift: { id: string; openedAt: string; status: string } | null
  items: Array<{
    id: string
    type: string
    description: string
    quantity: number | string
    unitPrice: number | string
    subtotal: number | string
    discountAmount: number | string
    total: number | string
    product: { id: string; name: string; type: string } | null
  }>
  payments: Array<{
    id: string
    paymentMethod: string
    grandTotal: number | string
    paidAt: string
  }>
}

interface CustomerDetail {
  id: string
  fullName: string
  phone: string | null
  type: 'MEMBER' | 'WALK_IN'
  notes: string | null
  totalHoursPlayed: number | string
  totalSpent: number | string
  deletedAt: string | null
  createdAt: string
  updatedAt: string
  _count?: { sessions: number }
}

interface HistoryResponse {
  invoices: CustomerHistoryInvoice[]
  totalSpent: number | string
  totalHoursPlayed: number | string
}

const PAYMENT_LABELS: Record<string, string> = {
  CASH: 'Tiền mặt',
  TRANSFER: 'Chuyển khoản',
  CARD: 'Thẻ',
  MEMBER: 'Hội viên',
}

const ITEM_LABELS: Record<string, string> = {
  PLAY_TIME: 'Giờ chơi',
  MEMBERSHIP_FEE: 'Phí hội viên',
  PRODUCT: 'Hàng hóa',
  SERVICE: 'Dịch vụ',
  DISCOUNT: 'Khuyến mãi',
  SURCHARGE: 'Phí gửi xe',
}

export function CustomerDetailScreen({ id }: Props) {
  const router = useRouter()
  const { success: notifySuccess, error: notifyError } = useToast()

  const [customer, setCustomer] = useState<CustomerDetail | null>(null)
  const [history, setHistory] = useState<CustomerHistoryInvoice[]>([])
  const [user, setUser] = useState<UserSession | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [customerRes, historyRes, userRes] = await Promise.all([
        apiJson<CustomerDetail>(`/api/customers/${id}`),
        apiJson<HistoryResponse>(`/api/customers/${id}/history`),
        apiJson<UserSession>('/api/auth/me'),
      ])

      if (!customerRes.success || !customerRes.data) {
        setError(customerRes.error || 'Không tải được khách hàng')
        return
      }
      setCustomer(customerRes.data)
      if (historyRes.success) setHistory(historyRes.data?.invoices ?? [])
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

  const isAdmin = isManagerOrAdmin(user?.role)

  const startEdit = useCallback(() => {
    if (!customer) return
    setFullName(customer.fullName)
    setPhone(customer.phone ?? '')
    setNotes(customer.notes ?? '')
    setEditing(true)
  }, [customer])

  const cancelEdit = useCallback(() => {
    setEditing(false)
  }, [])

  const handleSave = async () => {
    if (!customer) return
    const name = fullName.trim()
    if (!name) {
      notifyError('Họ tên không được để trống')
      return
    }

    setSaving(true)
    try {
      const data = await apiJson<CustomerDetail>(`/api/customers/${id}`, jsonRequest({
        fullName: name,
        phone: phone.trim() || '',
        notes: notes.trim() || undefined,
      }))
      if (!data.success) {
        notifyError(data.error || 'Không cập nhật được khách hàng')
        return
      }
      notifySuccess('Đã cập nhật thông tin hội viên')
      setEditing(false)
      void loadData()
    } catch {
      notifyError('Lỗi kết nối máy chủ')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      const data = await apiJson(`/api/customers/${id}`, { method: 'DELETE' })
      if (!data.success) {
        notifyError(data.error || 'Không xoá được hội viên')
        return
      }
      notifySuccess('Đã xoá hội viên')
      router.push('/customers')
    } catch {
      notifyError('Lỗi kết nối máy chủ')
    } finally {
      setDeleting(false)
    }
  }

  const stats = useMemo(() => {
    if (!customer) return { sessions: 0, spent: 0, hours: 0 }
    return {
      sessions: customer._count?.sessions ?? 0,
      spent: Number(customer.totalSpent),
      hours: Number(customer.totalHoursPlayed),
    }
  }, [customer])

  if (loading) {
    return <CustomerDetailSkeleton />
  }

  if (!customer) {
    return (
      <div className="min-h-full bg-zinc-50 px-4 py-4 dark:bg-zinc-950 md:px-6 md:py-6">
        <div className="mx-auto max-w-3xl space-y-4">
          <BackButton />
          <EmptyState
            icon={User}
            message="Không tìm thấy hội viên"
            description={error || 'Hội viên có thể đã bị xoá hoặc đường dẫn không đúng.'}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-full bg-zinc-50 px-4 py-4 dark:bg-zinc-950 md:px-6 md:py-6">
      <div className="mx-auto max-w-3xl space-y-4">
        <BackButton />

        {error && (
          <NoticeCard
            tone="danger"
            title="Không tải được dữ liệu"
            description={error}
          />
        )}

        {/* ── Header / hồ sơ ── */}
        <section className="rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-xl font-bold text-zinc-950 dark:text-white">
                  {customer.fullName}
                </h1>
                <Badge variant={customer.type === 'MEMBER' ? 'purple' : 'blue'}>
                  {customer.type === 'MEMBER' ? 'Hội viên' : 'Vãng lai'}
                </Badge>
              </div>
              <p className="mt-1 flex items-center gap-1.5 text-sm text-zinc-500 dark:text-zinc-400">
                <Phone size={14} />
                {customer.phone || 'Chưa có số điện thoại'}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              {!editing && (
                <Button variant="secondary" size="sm" icon={Pencil} onClick={startEdit}>
                  Chỉnh sửa
                </Button>
              )}
              {isAdmin && (
                <Button
                  variant="outline-danger"
                  size="sm"
                  icon={Trash2}
                  onClick={() => setDeleteOpen(true)}
                >
                  Xoá
                </Button>
              )}
            </div>
          </div>

          {/* Form chỉnh sửa */}
          {editing ? (
            <div className="border-t border-zinc-200 p-5 dark:border-zinc-800">
              <div className="space-y-3">
                <div>
                  <Label htmlFor="customer-full-name" required>Họ tên</Label>
                  <Input
                    id="customer-full-name"
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    placeholder="Họ tên hội viên"
                  />
                </div>
                <div>
                  <Label htmlFor="customer-phone">Số điện thoại</Label>
                  <Input
                    id="customer-phone"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    placeholder="0xxxxxxxxx"
                    inputMode="tel"
                  />
                </div>
                <div>
                  <Label htmlFor="customer-notes">Ghi chú</Label>
                  <Textarea
                    id="customer-notes"
                    rows={3}
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="Ghi chú nội bộ (tuỳ chọn)"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="secondary" size="md" disabled={saving} onClick={cancelEdit}>
                    Huỷ
                  </Button>
                  <Button
                    variant="primary"
                    size="md"
                    icon={Save}
                    loading={saving}
                    disabled={saving}
                    onClick={handleSave}
                  >
                    Lưu
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            customer.notes ? (
              <div className="border-t border-zinc-200 px-5 py-3 dark:border-zinc-800">
                <p className="text-sm text-zinc-600 dark:text-zinc-300">{customer.notes}</p>
              </div>
            ) : null
          )}
        </section>

        {/* ── Thống kê ── */}
        <section className="grid grid-cols-3 gap-2 md:gap-3">
          <DetailStat label="Số lần chơi" value={String(stats.sessions)} />
          <DetailStat label="Tổng chi" value={money(stats.spent)} />
          <DetailStat label="Giờ đã chơi" value={`${stats.hours}h`} />
        </section>

        {/* ── Lịch sử thanh toán ── */}
        <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
            <div className="flex items-center gap-2">
              <History size={16} className="text-zinc-400" />
              <h2 className="text-sm font-semibold text-zinc-950 dark:text-white">
                Lịch sử thanh toán
              </h2>
            </div>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              {history.length} hoá đơn
            </span>
          </div>

          {history.length === 0 ? (
            <div className="p-8">
              <EmptyState
                icon={ReceiptText}
                message="Chưa có hoá đơn nào"
                description="Thanh toán giờ chơi, hàng hoá hoặc phí hội viên sẽ xuất hiện ở đây."
              />
            </div>
          ) : (
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
              {history.map((invoice) => (
                <InvoiceHistoryRow key={invoice.id} invoice={invoice} />
              ))}
            </ul>
          )}
        </section>

        <ConfirmDialog
          open={deleteOpen}
          onClose={() => setDeleteOpen(false)}
          title="Xoá hội viên"
          description={`Hội viên "${customer.fullName}" sẽ bị xoá khỏi danh sách. Lịch sử tài chính vẫn được giữ lại để báo cáo.`}
          confirmLabel="Xoá"
          submitting={deleting}
          onConfirm={handleDelete}
        />
      </div>
    </div>
  )
}

function BackButton() {
  const router = useRouter()
  return (
    <button
      type="button"
      onClick={() => router.back()}
      className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
    >
      <ArrowLeft size={16} />
      Quay lại
    </button>
  )
}

function DetailStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-[11px] text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className="mt-1 truncate text-lg font-bold tabular-nums text-zinc-950 dark:text-white">
        {value}
      </p>
    </div>
  )
}

function InvoiceHistoryRow({ invoice }: { invoice: CustomerHistoryInvoice }) {
  const statusLabel = invoice.status === 'PAID'
    ? 'Đã thanh toán'
    : invoice.status === 'CANCELLED'
      ? 'Đã huỷ'
      : 'Nháp'

  const statusVariant = invoice.status === 'PAID'
    ? 'success'
    : invoice.status === 'CANCELLED'
      ? 'danger'
      : 'default'

  return (
    <li>
      <div className="px-4 py-3.5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ReceiptText size={16} className="text-zinc-400" />
            <span className="font-mono text-sm font-medium text-zinc-950 dark:text-white">
              {invoice.invoiceNo}
            </span>
            <Badge variant={statusVariant as 'success' | 'danger' | 'default'} size="sm">
              {statusLabel}
            </Badge>
          </div>
          <span className="text-sm font-semibold tabular-nums text-zinc-950 dark:text-white">
            {money(invoice.grandTotal)}
          </span>
        </div>

        <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
          {invoice.paidAt
            ? formatDay(invoice.paidAt)
            : invoice.createdAt ? formatDay(invoice.createdAt) : ''}
          {invoice.staff ? ` · ${invoice.staff.fullName}` : ''}
          {invoice.shift && invoice.shift.openedAt
            ? ` · Ca ${formatDay(invoice.shift.openedAt)}`
            : ''}
        </p>

        {invoice.items.length > 0 && (
          <div className="mt-2 space-y-1">
            {invoice.items.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 text-xs"
              >
                <span className="min-w-0 truncate text-zinc-600 dark:text-zinc-300">
                  {ITEM_LABELS[item.type] ?? item.description}
                  {item.type === 'PRODUCT' && item.product
                    ? ` · ${item.product.name}`
                    : ''}
                  {item.type !== 'PRODUCT' && item.description
                    ? ` · ${item.description}`
                    : ''}
                </span>
                <span className="shrink-0 tabular-nums text-zinc-500 dark:text-zinc-400">
                  {money(item.total)}
                </span>
              </div>
            ))}
          </div>
        )}

        {invoice.payments.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {invoice.payments.map((payment) => (
              <Badge key={payment.id} variant="outline" size="sm">
                {PAYMENT_LABELS[payment.paymentMethod] ?? payment.paymentMethod}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </li>
  )
}

function CustomerDetailSkeleton() {
  return (
    <div className="min-h-full bg-zinc-50 px-4 py-4 dark:bg-zinc-950 md:px-6 md:py-6">
      <div className="mx-auto max-w-3xl space-y-4">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-32 w-full" />
        <div className="grid grid-cols-3 gap-2">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    </div>
  )
}
