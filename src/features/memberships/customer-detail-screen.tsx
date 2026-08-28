'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Calendar,
  ChevronRight,
  History,
  Pencil,
  Phone,
  ReceiptText,
  RefreshCw,
  Save,
  Trash2,
  User,
  X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Input, Label, Textarea } from '@/components/ui/input'
import { NoticeCard } from '@/components/ui/notice-card'
import { Skeleton, SkeletonPage, SkeletonPanel } from '@/components/ui/skeleton'
import { useToast } from '@/components/ui/toast'
import { isManagerOrAdmin } from '@/lib/shared/roles'
import { apiJson, jsonRequest } from '@/lib/api'
import { shortInvoiceNo } from '@/lib/shared/utils'
import { money, formatDay } from '@/features/pos/format'
import { RenewMemberDialog, type RenewMemberInput, type MemberStatus } from './renew-member-dialog'
import type { Membership, MembershipPlan, Shift, UserSession } from '@/features/pos/types'

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
  // Dữ liệu phục vụ gia hạn — chỉ load khi khách là MEMBER
  const [memberships, setMemberships] = useState<Membership[]>([])
  const [plans, setPlans] = useState<MembershipPlan[]>([])
  const [shift, setShift] = useState<Shift | null>(null)
  const [renewOpen, setRenewOpen] = useState(false)
  const [renewSubmitting, setRenewSubmitting] = useState(false)

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

      // MEMBER mới cần dữ liệu gia hạn — tách song song nhưng không chặn màn hình
      if (customerRes.data.type === 'MEMBER') {
        const [membershipsRes, plansRes, shiftRes] = await Promise.all([
          apiJson<Membership[]>(`/api/memberships?customerId=${id}`),
          apiJson<MembershipPlan[]>('/api/membership-plans'),
          apiJson<Shift | null>('/api/shifts?current=true'),
        ])
        if (membershipsRes.success) setMemberships(membershipsRes.data ?? [])
        if (plansRes.success) setPlans((plansRes.data ?? []).filter((plan) => plan.isActive))
        if (shiftRes.success) setShift(shiftRes.data ?? null)
      } else {
        setMemberships([])
        setPlans([])
        setShift(null)
      }
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

  // Trạng thái hội viên từ memberships đã tải (server trả orderBy startsAt desc)
  const membershipInfo = useMemo(() => {
    if (!customer || customer.type !== 'MEMBER') return null
    const now = new Date()
    const current = memberships.find((m) => new Date(m.startsAt) <= now && new Date(m.expiresAt) > now) ?? null
    const latest = memberships[0] ?? null
    const status: MemberStatus = current
      ? 'ACTIVE'
      : latest
        ? 'EXPIRED'
        : 'NONE'
    return { current, latest, status }
  }, [customer, memberships])

  const renewInput: RenewMemberInput | null = customer && membershipInfo
    ? {
        id: customer.id,
        fullName: customer.fullName,
        membershipStatus: membershipInfo.status,
        currentMembership: membershipInfo.current
          ? { expiresAt: membershipInfo.current.expiresAt }
          : null,
      }
    : null

  // Số ngày còn lại của kỳ hiện tại — tính một lần theo kỳ, không tick theo render
  // (trang không có interval refresh; sau gia hạn/đăng ký mới sẽ load lại).
  const daysToExpiry = useMemo<number | null>(() => {
    const expiresAt = membershipInfo?.current?.expiresAt
    if (!expiresAt) return null
    // eslint-disable-next-line react-hooks/purity
    return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86_400_000))
  }, [membershipInfo])

  const handleRenewed = async () => {
    notifySuccess('Đã gia hạn hội viên')
    setRenewOpen(false)
    await loadData()
  }

  if (loading) {
    return <CustomerDetailSkeleton />
  }

  if (!customer) {
    return (
      <div className="min-h-full bg-zinc-50 px-4 py-4 dark:bg-zinc-950 md:px-6 md:py-6">
        <div className="mx-auto max-w-5xl space-y-4">
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

  const isMember = customer.type === 'MEMBER'
  const monogram = getMonogram(customer.fullName)

  return (
    <div className="min-h-full bg-zinc-50 px-4 py-4 dark:bg-zinc-950 md:px-6 md:py-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <BackButton />

        {error && (
          <NoticeCard
            tone="danger"
            title="Không tải được dữ liệu"
            description={error}
          />
        )}

        <div className="grid gap-4 md:grid-cols-5">
          {/* ── Rail: hồ sơ + thống kê + ghi chú ── */}
          <ProfileRail
            customer={customer}
            monogram={monogram}
            stats={stats}
            isAdmin={isAdmin}
            editing={editing}
            fullName={fullName}
            phone={phone}
            notes={notes}
            saving={saving}
            onFullNameChange={setFullName}
            onPhoneChange={setPhone}
            onNotesChange={setNotes}
            onStartEdit={startEdit}
            onCancelEdit={cancelEdit}
            onSave={handleSave}
            onDelete={() => setDeleteOpen(true)}
          />

          {/* ── Main: trạng thái hội viên (member) hoặc khoảng trống (walk-in) + lịch sử ── */}
          <div className="space-y-4 md:col-span-3">
            {isMember && membershipInfo && (
              <MembershipStatusBlock
                status={membershipInfo.status}
                current={membershipInfo.current}
                daysToExpiry={daysToExpiry}
                shiftReady={!!shift}
                onRenew={() => setRenewOpen(true)}
              />
            )}

            <HistorySection history={history} />
          </div>
        </div>

        <ConfirmDialog
          open={deleteOpen}
          onClose={() => setDeleteOpen(false)}
          title="Xoá hội viên"
          description={`Hội viên "${customer.fullName}" sẽ bị xoá khỏi danh sách. Lịch sử tài chính vẫn được giữ lại để báo cáo.`}
          confirmLabel="Xoá"
          submitting={deleting}
          onConfirm={handleDelete}
        />

        {renewInput && (
          <RenewMemberDialog
            member={renewOpen ? renewInput : null}
            plans={plans}
            submitting={renewSubmitting}
            setSubmitting={setRenewSubmitting}
            onClose={() => setRenewOpen(false)}
            onDone={handleRenewed}
          />
        )}
      </div>
    </div>
  )
}

/** Lấy 1-2 chữ cái đầu của tên để làm monogram trong avatar. */
function getMonogram(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
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

// ── ProfileRail: avatar + tên + phone + edit/delete icon + thống kê + ghi chú ──
function ProfileRail({
  customer,
  monogram,
  stats,
  isAdmin,
  editing,
  fullName,
  phone,
  notes,
  saving,
  onFullNameChange,
  onPhoneChange,
  onNotesChange,
  onStartEdit,
  onCancelEdit,
  onSave,
  onDelete,
}: {
  customer: CustomerDetail
  monogram: string
  stats: { sessions: number; spent: number; hours: number }
  isAdmin: boolean
  editing: boolean
  fullName: string
  phone: string
  notes: string
  saving: boolean
  onFullNameChange: (value: string) => void
  onPhoneChange: (value: string) => void
  onNotesChange: (value: string) => void
  onStartEdit: () => void
  onCancelEdit: () => void
  onSave: () => void
  onDelete: () => void
}) {
  return (
    <aside className="md:col-span-2">
      <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 md:p-5">
        <div className="flex items-start gap-3">
          <div
            aria-hidden
            className="flex size-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-zinc-200 to-zinc-100 text-base font-bold text-zinc-700 ring-1 ring-zinc-200 dark:from-zinc-700 dark:to-zinc-800 dark:text-zinc-200 dark:ring-zinc-700"
          >
            {monogram}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h1 className="truncate text-lg font-bold text-zinc-950 dark:text-white">
                  {customer.fullName}
                </h1>
                <Badge variant={customer.type === 'MEMBER' ? 'purple' : 'blue'} size="sm" className="mt-1">
                  {customer.type === 'MEMBER' ? 'Hội viên' : 'Vãng lai'}
                </Badge>
              </div>
              {!editing && (
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={onStartEdit}
                    title="Chỉnh sửa hồ sơ"
                    aria-label="Chỉnh sửa hồ sơ"
                    className="inline-flex size-8 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                  >
                    <Pencil size={15} />
                  </button>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={onDelete}
                      title="Xoá hội viên"
                      aria-label="Xoá hội viên"
                      className="inline-flex size-8 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-red-50 hover:text-red-600 dark:text-zinc-400 dark:hover:bg-red-500/10 dark:hover:text-red-300"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              )}
            </div>

            <a
              href={customer.phone ? `tel:${customer.phone}` : undefined}
              className="mt-2 inline-flex items-center gap-1.5 text-sm text-zinc-600 transition-colors hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white"
            >
              <Phone size={13} />
              {customer.phone || 'Chưa có SĐT'}
            </a>
          </div>
        </div>

        {editing ? (
          <div className="mt-4 space-y-3 border-t border-zinc-200 pt-4 dark:border-zinc-800">
            <div>
              <Label htmlFor="customer-full-name" required>Họ tên</Label>
              <Input
                id="customer-full-name"
                value={fullName}
                onChange={(event) => onFullNameChange(event.target.value)}
                placeholder="Họ tên hội viên"
              />
            </div>
            <div>
              <Label htmlFor="customer-phone">Số điện thoại</Label>
              <Input
                id="customer-phone"
                value={phone}
                onChange={(event) => onPhoneChange(event.target.value)}
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
                onChange={(event) => onNotesChange(event.target.value)}
                placeholder="Ghi chú nội bộ (tuỳ chọn)"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" disabled={saving} onClick={onCancelEdit}>
                <X size={14} />
                Huỷ
              </Button>
              <Button
                variant="primary"
                size="sm"
                icon={Save}
                loading={saving}
                disabled={saving}
                onClick={onSave}
              >
                Lưu
              </Button>
            </div>
          </div>
        ) : customer.notes ? (
          <p className="mt-4 border-t border-zinc-200 pt-3 text-sm text-zinc-600 dark:border-zinc-800 dark:text-zinc-300">
            {customer.notes}
          </p>
        ) : null}
      </div>

      {/* Thống kê — dải số liệu dưới hồ sơ, dùng chung rhythm rail */}
      <div className="mt-3 grid grid-cols-3 divide-x divide-zinc-200 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
        <RailStat label="Lần chơi" value={String(stats.sessions)} />
        <RailStat label="Tổng chi" value={money(stats.spent)} />
        <RailStat label="Giờ chơi" value={`${stats.hours}h`} />
      </div>
    </aside>
  )
}

function RailStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-3 py-3 text-center">
      <p className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {label}
      </p>
      <p className="mt-0.5 truncate text-base font-bold tabular-nums text-zinc-950 dark:text-white">
        {value}
      </p>
    </div>
  )
}

// ── MembershipStatusBlock: focal point cho hội viên ──
// Hiển thị trạng thái + ngày hết hạn + gói + CTA đóng tiếp/gia hạn
function MembershipStatusBlock({
  status,
  current,
  daysToExpiry,
  shiftReady,
  onRenew,
}: {
  status: MemberStatus
  current: Membership | null
  daysToExpiry: number | null
  shiftReady: boolean
  onRenew: () => void
}) {
  const isActive = status === 'ACTIVE'
  const isExpired = status === 'EXPIRED'
  const isNone = status === 'NONE'

  // Tông màu theo trạng thái — bề mặt giữ trung tính, điểm nhấn là viền + status dot
  const accent = isActive
    ? 'before:bg-emerald-500'
    : isExpired
      ? 'before:bg-amber-500'
      : 'before:bg-zinc-400'

  const statusLabel = isActive ? 'Còn hạn' : isExpired ? 'Hết hạn' : 'Chưa có kỳ'
  const statusVariant = isActive ? 'success' : isExpired ? 'warning' : 'default'

  const ctaLabel = isActive ? 'Đóng tiếp kỳ mới' : isExpired ? 'Gia hạn để chơi' : 'Đăng ký kỳ đầu'
  const ctaDisabled = isNone || !shiftReady
  const ctaHint = isNone
    ? 'Hội viên chưa có kỳ nào'
    : !shiftReady
      ? 'Cần mở ca trước khi thu phí'
      : null

  return (
    <section
      className={`relative overflow-hidden rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 before:absolute before:left-0 before:top-0 before:h-full before:w-1 ${accent}`}
    >
      <div className="flex items-center gap-2">
        <Calendar size={14} className="text-zinc-400" />
        <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          Trạng thái hội viên
        </p>
      </div>

      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-3xl font-extrabold tracking-tight text-zinc-950 dark:text-white">
          {isActive && daysToExpiry !== null
            ? `Còn ${daysToExpiry} ngày`
            : statusLabel}
        </span>
        {isActive ? null : (
          <Badge variant={statusVariant} size="sm">
            {statusLabel}
          </Badge>
        )}
      </div>

      {current ? (
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          {isActive ? 'Hết hạn' : 'Đã hết hạn'} vào{' '}
          <span className="font-medium text-zinc-950 dark:text-white">
            {formatDay(current.expiresAt)}
          </span>
          {current.plan ? ` · ${current.plan.name}` : ''}
        </p>
      ) : (
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Chưa có kỳ hội viên nào được ghi nhận.
        </p>
      )}

      <div className="mt-5">
        <Button
          variant="primary"
          size="lg"
          fullWidth
          icon={RefreshCw}
          disabled={ctaDisabled}
          onClick={onRenew}
        >
          {ctaLabel}
        </Button>
        {ctaHint ? (
          <p className="mt-2 text-center text-xs text-zinc-500 dark:text-zinc-400">
            {ctaHint}
          </p>
        ) : null}
      </div>
    </section>
  )
}

// ── HistorySection: lịch sử thanh toán dạng compact row ──
function HistorySection({ history }: { history: CustomerHistoryInvoice[] }) {
  const totalSpent = useMemo(
    () => history
      .filter((invoice) => invoice.status === 'PAID')
      .reduce((sum, invoice) => sum + Number(invoice.grandTotal), 0),
    [history],
  )

  return (
    <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <header className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <div className="flex items-center gap-2">
          <History size={15} className="text-zinc-400" />
          <h2 className="text-sm font-semibold text-zinc-950 dark:text-white">
            Lịch sử thanh toán
          </h2>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            · {history.length} hoá đơn
          </span>
        </div>
        {history.length > 0 ? (
          <span className="text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
            Tổng {money(totalSpent)}
          </span>
        ) : null}
      </header>

      {history.length === 0 ? (
        <div className="p-8">
          <EmptyState
            icon={ReceiptText}
            message="Chưa có hoá đơn nào"
            description="Thanh toán giờ chơi, hàng hoá hoặc phí hội viên sẽ xuất hiện ở đây."
          />
        </div>
      ) : (
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
          {history.map((invoice) => (
            <InvoiceHistoryRow key={invoice.id} invoice={invoice} />
          ))}
        </ul>
      )}
    </section>
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
      <details className="group">
        <summary className="flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/40 [&::-webkit-details-marker]:hidden">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
            <ReceiptText size={14} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-semibold text-zinc-950 dark:text-white">
                {shortInvoiceNo(invoice.invoiceNo)}
              </span>
              <Badge variant={statusVariant as 'success' | 'danger' | 'default'} size="sm">
                {statusLabel}
              </Badge>
            </div>
            <p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
              {invoice.paidAt
                ? formatDay(invoice.paidAt)
                : invoice.createdAt ? formatDay(invoice.createdAt) : ''}
              {invoice.staff ? ` · ${invoice.staff.fullName}` : ''}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-sm font-bold tabular-nums text-zinc-950 dark:text-white">
              {money(invoice.grandTotal)}
            </span>
            <ChevronRight
              size={14}
              className="text-zinc-400 transition-transform group-open:rotate-90"
            />
          </div>
        </summary>

        <div className="border-t border-zinc-100 bg-zinc-50/60 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/40">
          {invoice.items.length > 0 ? (
            <ul className="space-y-1.5">
              {invoice.items.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-3 text-xs"
                >
                  <span className="min-w-0 truncate text-zinc-700 dark:text-zinc-300">
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
                </li>
              ))}
            </ul>
          ) : null}

          {invoice.payments.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {invoice.payments.map((payment) => (
                <Badge key={payment.id} variant="outline" size="sm">
                  {PAYMENT_LABELS[payment.paymentMethod] ?? payment.paymentMethod}
                </Badge>
              ))}
            </div>
          ) : null}

          {invoice.shift && invoice.shift.openedAt ? (
            <p className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400">
              Ca {formatDay(invoice.shift.openedAt)}
            </p>
          ) : null}
        </div>
      </details>
    </li>
  )
}

function CustomerDetailSkeleton() {
  return (
    <SkeletonPage maxWidth="max-w-5xl">
        <Skeleton className="h-6 w-24" />
        <div className="grid gap-4 md:grid-cols-5">
          <div className="md:col-span-2 space-y-3">
            <SkeletonPanel><Skeleton className="h-32 w-full" /></SkeletonPanel>
            <SkeletonPanel><Skeleton className="h-16 w-full" /></SkeletonPanel>
          </div>
          <div className="md:col-span-3 space-y-4">
            <SkeletonPanel><Skeleton className="h-40 w-full" /></SkeletonPanel>
            <SkeletonPanel><Skeleton className="h-64 w-full" /></SkeletonPanel>
          </div>
        </div>
    </SkeletonPage>
  )
}
