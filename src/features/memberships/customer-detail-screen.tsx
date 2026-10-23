'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
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
import { Card } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Input, Label, Textarea } from '@/components/ui/input'
import { NoticeCard } from '@/components/ui/notice-card'
import { AppSkeleton } from '@/components/ui/skeleton'
import { useToast } from '@/components/ui/toast'
import { PAGE_TITLE_CLASS } from '@/components/ui/page-title'
import { isManagerOrAdmin } from '@/lib/shared/roles'
import { apiJson, jsonRequest } from '@/lib/api'
import { shortInvoiceNo } from '@/lib/shared/utils'
import { money, formatDay } from '@/features/pos/format'
import { shiftTimeRange } from '@/features/shifts/shift-ledger'
import { RenewMemberDialog, type RenewMemberInput, type MemberStatus } from './renew-member-dialog'
import { PlayCalendar } from './play-calendar'
import type { PlayDay } from './play-calendar-data'
import type { Membership, MembershipPlan, Shift, UserSession } from '@/features/pos/types'

interface Props {
  id: string
  today: string
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
  playDays: PlayDay[]
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

export function CustomerDetailScreen({ id, today }: Props) {
  const router = useRouter()
  const { success: notifySuccess, error: notifyError } = useToast()

  const [customer, setCustomer] = useState<CustomerDetail | null>(null)
  const [history, setHistory] = useState<CustomerHistoryInvoice[]>([])
  const [playDays, setPlayDays] = useState<PlayDay[]>([])
  const [user, setUser] = useState<UserSession | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [historyError, setHistoryError] = useState('')
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

  const loadData = useCallback(async (opts?: { silent?: boolean }) => {
    if (opts?.silent) setRefreshing(true)
    else setLoading(true)
    setError('')
    setHistoryError('')
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
      if (historyRes.success) {
        setHistory(historyRes.data?.invoices ?? [])
        setPlayDays(historyRes.data?.playDays ?? [])
      } else {
        setHistoryError(historyRes.error || 'Không tải được lịch sử thanh toán')
      }
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
      setRefreshing(false)
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
      void loadData({ silent: true })
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
  // Kỳ CANCELLED (hoá đơn phí bị huỷ) không còn hiệu lực — không tính là còn hạn
  const membershipInfo = useMemo(() => {
    if (!customer || customer.type !== 'MEMBER') return null
    const now = new Date()
    const activeMemberships = memberships.filter((m) => m.status === 'ACTIVE')
    const current = activeMemberships.find((m) => new Date(m.startsAt) <= now && new Date(m.expiresAt) > now) ?? null
    const latest = activeMemberships[0] ?? null
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
    await loadData({ silent: true })
  }

  if (loading) {
    return <AppSkeleton />
  }

  if (!customer) {
    return (
    <div className="min-h-full bg-surface-secondary px-4 py-4 md:px-6 md:py-6">
      <div className="mx-auto max-w-content space-y-4">
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
      <div className="min-h-full bg-surface-secondary px-4 py-4 md:px-6 md:py-6">
        <div className="mx-auto max-w-content space-y-4">
          <BackButton />

        {error && (
          <NoticeCard
            tone="danger"
            title="Không tải được dữ liệu"
            description={error}
          />
        )}

        <div className="grid gap-4 lg:grid-cols-5">
          {/* ── Rail: hồ sơ + thống kê + trạng thái hội viên ── */}
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
            membership={isMember && membershipInfo ? (
              <MembershipStatusBlock
                status={membershipInfo.status}
                current={membershipInfo.current}
                latest={membershipInfo.latest}
                daysToExpiry={daysToExpiry}
                shiftReady={!!shift}
                onRenew={() => setRenewOpen(true)}
              />
            ) : null}
            membershipHistory={isMember && membershipInfo ? (
              <MembershipHistorySection memberships={memberships} />
            ) : null}
          />

          {/* ── Main: hoạt động chơi + lịch sử thanh toán ── */}
          <div className="min-w-0 space-y-4 lg:col-span-3">
            {historyError ? null : (
              <>
                <PlayCalendar playDays={playDays} today={today} />
                <MonthlyPlayStats playDays={playDays} />
              </>
            )}
            <HistorySection
              history={history}
              totalSpent={stats.spent}
              error={historyError}
              refreshing={refreshing}
              onRetry={() => void loadData({ silent: true })}
            />
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
      className="-ml-1 inline-flex items-center gap-1.5 py-2 pr-2 text-sm font-medium text-text-tertiary transition-colors hover:text-text-primary"
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
  membership,
  membershipHistory,
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
  membership?: ReactNode
  membershipHistory?: ReactNode
}) {
  return (
    <aside className="min-w-0 lg:col-span-2">
      <Card padding="none" className="p-4 md:p-5">
        <div className="flex items-start gap-3">
          <div
            aria-hidden
            className="flex size-12 shrink-0 items-center justify-center rounded-full bg-surface-tertiary text-base font-bold text-text-secondary ring-1 ring-border-default"
          >
            {monogram}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <h1 className={`min-w-0 break-words ${PAGE_TITLE_CLASS}`}>
                {customer.fullName}
              </h1>
              {!editing && (
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="white"
                    size="lg"
                    className="size-11"
                    icon={Pencil}
                    onClick={onStartEdit}
                    title="Chỉnh sửa hồ sơ"
                    aria-label="Chỉnh sửa hồ sơ"
                  />
                  {isAdmin && (
                    <Button
                      variant="red-soft"
                      size="lg"
                      className="size-11"
                      icon={Trash2}
                      onClick={onDelete}
                      title="Xoá hội viên"
                      aria-label="Xoá hội viên"
                    />
                  )}
                </div>
              )}
            </div>

            {customer.phone ? (
              <a
                href={`tel:${customer.phone}`}
                className="mt-2 inline-flex items-center gap-1.5 text-sm text-text-secondary transition-colors hover:text-text-primary"
              >
                <Phone size={13} />
                {customer.phone}
              </a>
            ) : (
              <span className="mt-2 inline-flex items-center gap-1.5 text-sm text-text-tertiary">
                <Phone size={13} />
                Chưa có SĐT
              </span>
            )}
          </div>
        </div>

        {editing ? (
          <div className="mt-4 space-y-3 border-t border-border-default pt-4">
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
            <Button variant="white" size="sm" disabled={saving} onClick={onCancelEdit}>
                <X size={14} />
                Huỷ
              </Button>
        <Button
          variant="contrast"
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
          <p className="mt-4 border-t border-border-default pt-3 text-sm text-text-secondary">
            {customer.notes}
          </p>
        ) : null}
      </Card>

      {/* Thống kê + trạng thái hội viên — một khối duy nhất trong rail */}
      <Card padding="none" className="mt-3 overflow-hidden">
        <div className="grid grid-cols-3 divide-x divide-border-default">
          <RailStat label="Lần chơi" value={String(stats.sessions)} />
          <RailStat label="Tổng chi" value={money(stats.spent, false)} />
          <RailStat
            label="Giờ chơi"
            value={`${stats.hours.toLocaleString('vi-VN', { maximumFractionDigits: 2 })}h`}
          />
        </div>
        {membership ? <div className="border-t border-border-default">{membership}</div> : null}
      </Card>

      {membership ? <div className="mt-3">{membershipHistory}</div> : null}
    </aside>
  )
}

function RailStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-2 py-3 text-center">
      <p className="text-[10px] uppercase tracking-wide text-text-tertiary">
        {label}
      </p>
      <p className="mt-0.5 truncate text-sm font-bold tabular-nums text-text-primary xl:text-base">
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
  latest,
  daysToExpiry,
  shiftReady,
  onRenew,
}: {
  status: MemberStatus
  current: Membership | null
  latest: Membership | null
  daysToExpiry: number | null
  shiftReady: boolean
  onRenew: () => void
}) {
  const isActive = status === 'ACTIVE'
  const isExpired = status === 'EXPIRED'

  // Tông màu theo trạng thái — bề mặt giữ trung tính, điểm nhấn là viền + status dot
  const accent = isActive
  ? 'before:bg-success'
    : isExpired
    ? 'before:bg-warning'
      : 'before:bg-text-tertiary'

  const statusLabel = isActive ? 'Còn hạn' : isExpired ? 'Hết hạn' : 'Chưa có kỳ'

  const ctaLabel = isActive ? 'Đóng tiếp kỳ mới' : isExpired ? 'Gia hạn để chơi' : 'Đăng ký kỳ đầu'
  const ctaDisabled = !shiftReady
  const ctaHint = !shiftReady ? 'Cần mở ca trước khi thu phí' : null
  const displayMembership = current ?? latest

  return (
    <div
      className={`relative overflow-hidden p-4 before:absolute before:left-0 before:top-0 before:h-full before:w-1 ${accent}`}
    >
      <div className="flex items-center gap-2">
        <Calendar size={14} className="text-text-tertiary" />
        <p className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
          Trạng thái hội viên
        </p>
      </div>

      <p className="mt-3 text-2xl font-bold tracking-tight text-text-primary">
        {isActive && daysToExpiry !== null
          ? `Còn ${daysToExpiry} ngày`
          : statusLabel}
        </p>

      {displayMembership ? (
        <p className="mt-1 text-sm text-text-tertiary">
          {isActive ? 'Hết hạn' : 'Đã hết hạn'} vào{' '}
          <span className="font-medium text-text-primary">
            {formatDay(displayMembership.expiresAt)}
          </span>
          {displayMembership.plan ? ` · ${displayMembership.plan.name}` : ''}
        </p>
      ) : (
        <p className="mt-1 text-sm text-text-tertiary">
          Chưa có kỳ hội viên nào được ghi nhận.
        </p>
      )}

      <div className="mt-5">
        <Button
          variant="yellow"
          size="lg"
          fullWidth
          icon={RefreshCw}
          disabled={ctaDisabled}
          onClick={onRenew}
        >
          {ctaLabel}
        </Button>
        {ctaHint ? (
          <p className="mt-2 text-center text-xs text-text-tertiary">
            {ctaHint}
          </p>
        ) : null}
        </div>
    </div>
  )
}

function MembershipHistorySection({ memberships }: { memberships: Membership[] }) {
  return (
    <Card padding="none" className="overflow-hidden">
      <header className="flex items-center gap-2 border-b border-border-default px-4 py-3">
        <History size={15} className="text-text-tertiary" />
        <h2 className="text-sm font-semibold text-text-primary">
          Lịch sử đóng phí
        </h2>
        <span className="text-xs text-text-tertiary">
          · {memberships.length} kỳ
        </span>
      </header>

      {memberships.length === 0 ? (
        <p className="p-4 text-sm text-text-tertiary">
          Chưa có lịch sử hội viên.
      </p>
      ) : (
        <ul className="divide-y divide-border-default">
          {memberships.map((membership) => {
            const cancelled = membership.status === 'CANCELLED'
            // eslint-disable-next-line react-hooks/purity
            const expired = new Date(membership.expiresAt).getTime() <= Date.now()
            const statusLabel = cancelled ? 'Đã huỷ' : expired ? 'Hết hạn' : 'Còn hạn'
            const statusTone = cancelled
              ? 'text-danger'
              : expired
                ? 'text-warning'
                : 'text-success'

            return (
              <li key={membership.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="min-w-0 text-sm font-medium text-text-primary">
                    {membership.plan?.name ?? 'Gói hội viên'}
                  </p>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-text-primary">
                    {money(membership.plan?.price ?? 0, false)}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-3 text-xs">
                  <span className="min-w-0 text-text-tertiary">
                    {formatDay(membership.startsAt)} – {formatDay(membership.expiresAt)}
                  </span>
                  <span className={`shrink-0 font-medium ${statusTone}`}>
                    {statusLabel}
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

// ── HistorySection: lịch sử thanh toán dạng compact row ──
function HistorySection({
  history,
  totalSpent,
  error,
  refreshing,
  onRetry,
}: {
  history: CustomerHistoryInvoice[]
  totalSpent: number
  error: string
  refreshing: boolean
  onRetry: () => void
}) {
  const invoiceCount = history.filter((invoice) => invoice.status !== 'CANCELLED').length

  return (
    <Card padding="none" className="overflow-hidden">
      <header className="flex items-center justify-between gap-3 border-b border-border-default px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <History size={15} className="shrink-0 text-text-tertiary" />
          <h2 className="text-sm font-semibold text-text-primary">
            Lịch sử thanh toán
          </h2>
          <span className="text-xs text-text-tertiary">
            · {invoiceCount} hoá đơn
          </span>
        </div>
        {invoiceCount > 0 ? (
          <span className="shrink-0 text-xs tabular-nums text-text-tertiary">
            Tổng đã thu {money(totalSpent, false)}
          </span>
        ) : null}
      </header>

      {error ? (
        <div className="p-4">
          <NoticeCard
            tone="warning"
            title="Không tải được lịch sử thanh toán"
            description={error}
            action={(
              <Button
                variant="white"
                size="sm"
                loading={refreshing}
                disabled={refreshing}
                onClick={onRetry}
              >
                Thử lại
              </Button>
            )}
          />
        </div>
      ) : history.length === 0 ? (
        <div className="p-8">
          <EmptyState
            icon={ReceiptText}
            message="Chưa có hoá đơn nào"
            description="Thanh toán giờ chơi, hàng hoá hoặc phí hội viên sẽ xuất hiện ở đây."
          />
          </div>
      ) : (
        <ul className="divide-y divide-border-default">
          {history.map((invoice) => (
            <InvoiceHistoryRow key={invoice.id} invoice={invoice} />
          ))}
        </ul>
                  )}
    </Card>
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
        <summary className="flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-tertiary [&::-webkit-details-marker]:hidden">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-surface-tertiary text-text-tertiary">
            <ReceiptText size={14} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-semibold text-text-primary">
                {shortInvoiceNo(invoice.invoiceNo)}
              </span>
              <Badge variant={statusVariant as 'success' | 'danger' | 'default'} size="sm">
                {statusLabel}
              </Badge>
            </div>
            <p className="mt-0.5 truncate text-xs text-text-tertiary">
              {invoice.paidAt
                ? formatDay(invoice.paidAt)
                : invoice.createdAt ? formatDay(invoice.createdAt) : ''}
              {invoice.staff ? ` · ${invoice.staff.fullName}` : ''}
            </p>
            </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-sm font-bold tabular-nums text-text-primary">
              {money(invoice.grandTotal, false)}
            </span>
            <ChevronRight
              size={14}
              className="text-text-tertiary transition-transform group-open:rotate-90"
          />
            </div>
        </summary>

        <div className="border-t border-border-default bg-surface-secondary px-4 py-3">
          {invoice.items.length > 0 ? (
            <ul className="space-y-1.5">
              {invoice.items.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-3 text-xs"
                >
                  <span className="min-w-0 truncate text-text-secondary">
                    {ITEM_LABELS[item.type] ?? item.description}
                    {item.type === 'PRODUCT' && item.product
                      ? ` · ${item.product.name}`
                      : ''}
                    {item.type !== 'PRODUCT' && item.description
                      ? ` · ${item.description}`
                      : ''}
                  </span>
                  <span className="shrink-0 tabular-nums text-text-tertiary">
                    {money(item.total, false)}
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
            <p className="mt-2 text-xs text-text-tertiary">
              {shiftTimeRange(invoice.shift.openedAt, null)}
            </p>
          ) : null}

          <Link
            href={`/invoices/${invoice.id}`}
            className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-info hover:underline"
          >
            Xem chi tiết hoá đơn
            <ChevronRight size={12} aria-hidden />
          </Link>
        </div>
      </details>
    </li>
  )
}

function MonthlyPlayStats({ playDays }: { playDays: PlayDay[] }) {
  const rows = useMemo(() => {
    const map = new Map<string, number>()

    for (const day of playDays) {
      const month = day.day.slice(0, 7)
      map.set(month, Math.round(((map.get(month) ?? 0) + day.hours) * 100) / 100)
    }

    return [...map.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([month, hours]) => {
        const [year, monthNumber] = month.split('-')
        return { month, label: `Th${Number(monthNumber)}/${year}`, hours }
      })
  }, [playDays])

  if (rows.length === 0) return null

  const total = rows.reduce((sum, row) => sum + row.hours, 0)

  return (
    <Card padding="none" className="overflow-hidden">
      <header className="flex flex-col items-start gap-1 border-b border-border-default px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
        <h2 className="w-full min-w-0 truncate text-sm font-semibold text-text-primary sm:w-auto">
          Thống kê giờ chơi theo tháng
        </h2>
        <p className="shrink-0 whitespace-nowrap text-xs tabular-nums text-text-tertiary">
          Tổng {total.toLocaleString('vi-VN', { maximumFractionDigits: 2 })} giờ
        </p>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-default">
              <th
                scope="col"
                className="px-4 py-2 text-left text-xs font-medium text-text-tertiary"
              >
                Tháng
              </th>
              <th
                scope="col"
                className="px-4 py-2 text-right text-xs font-medium text-text-tertiary"
              >
                Số giờ
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-default">
            {rows.map((row) => (
              <tr key={row.month}>
                <td className="px-4 py-2 text-text-primary">{row.label}</td>
                <td className="px-4 py-2 text-right tabular-nums text-text-primary">
                  {row.hours.toLocaleString('vi-VN', { maximumFractionDigits: 2 })}h
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

