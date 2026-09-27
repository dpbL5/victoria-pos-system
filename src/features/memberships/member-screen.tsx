'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  Check,
  Settings,
  Ticket,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input, Label, Select, Textarea } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { NoticeCard } from '@/components/ui/notice-card'
import { AppSkeleton } from '@/components/ui/skeleton'
import { useApi } from '@/hooks/use-api'
import { SortableCardList, type Column as CardColumn } from '@/components/ui/sortable-card-list'
import { SortableTable, type Column } from '@/components/ui/sortable-table'
import { useToast } from '@/components/ui/toast'
import { isAdminOnly, isManagerOrAdmin } from '@/lib/shared/roles'
import { apiJson, jsonRequest } from '@/lib/api'
import { usePageRefresh } from '@/components/layout/page-refresh-context'
import { formatDay, money, toNumber } from '@/features/pos/format'
import { PaymentMethodPicker } from '@/features/pos/payment-method-picker'
import { RenewMemberDialog, type RenewMemberInput } from './renew-member-dialog'
import type { Customer, Membership, MembershipPlan, PaymentMethod, Shift, UserSession } from '@/features/pos/types'

type MemberStatus = 'ACTIVE' | 'EXPIRED' | 'NONE'
type StatusFilter = 'ALL' | MemberStatus

interface MemberCustomer extends Customer {
  createdAt: string
  currentMembership?: Membership | null
  latestMembership?: Membership | null
  membershipStatus: MemberStatus
}

export function MemberScreen() {
  const { success: notifySuccess } = useToast()
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
  const [registerOpen, setRegisterOpen] = useState(false)
  const [renewMember, setRenewMember] = useState<RenewMemberInput | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const { data: userData, isLoading: userLoading } = useApi<UserSession>('/api/auth/me', { dedupingInterval: 600_000 })

  const membersUrl = '/api/customers?type=MEMBER&includeMembershipStatus=true&limit=100'

  const { data: memberData, isLoading: memberLoading, mutate } = useApi<MemberCustomer[]>(membersUrl, { dedupingInterval: 120_000 })
  const { data: planData } = useApi<MembershipPlan[]>('/api/membership-plans', { dedupingInterval: 300_000 })
  const { data: shiftData } = useApi<Shift | null>('/api/shifts?current=true', { dedupingInterval: 30_000 })

  const { registerRefresh } = usePageRefresh()

  useEffect(() => {
    return registerRefresh(() => void mutate())
  }, [registerRefresh, mutate])

  const members: MemberCustomer[] = memberData?.data ?? []
  const plans: MembershipPlan[] = (planData?.data ?? []).filter((plan: MembershipPlan) => plan.isActive)
  const shift = shiftData?.data ?? null
  const error = !memberData?.success ? (memberData?.error as string ?? '') : ''
  const loading = memberLoading || userLoading
  const user = userData?.data ?? null

  const filteredMembers = useMemo(
    () => statusFilter === 'ALL'
      ? members
      : members.filter((member) => member.membershipStatus === statusFilter),
    [members, statusFilter]
  )

  const stats = useMemo(() => ({
    total: members.length,
    active: members.filter((member) => member.membershipStatus === 'ACTIVE').length,
    expired: members.filter((member) => member.membershipStatus === 'EXPIRED').length,
    none: members.filter((member) => member.membershipStatus === 'NONE').length,
  }), [members])
  const isAdmin = isManagerOrAdmin(user?.role)
  const canManagePlans = isAdminOnly(user?.role)

  const renderActions = useCallback((item: MemberCustomer) => (
    <div className="flex items-center gap-2">
      {isAdmin && (
        <Link
          href={`/customers/${item.id}`}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
        >
          <Settings size={16} />
          <span>Cài đặt</span>
        </Link>
      )}
    </div>
  ), [isAdmin])

  const renderMembershipStatus = useCallback((item: MemberCustomer) => {
    if (item.membershipStatus === 'ACTIVE' && item.currentMembership) {
      return formatDay(item.currentMembership.expiresAt)
    }
    if (item.membershipStatus === 'EXPIRED' && item.latestMembership) {
      return formatDay(item.latestMembership.expiresAt)
    }
    return 'Chưa đóng phí'
  }, [])

  const memberColumns: Column<MemberCustomer>[] = useMemo(() => [
    {
      key: 'fullName',
      label: 'Tên hội viên',
      cellClassName: 'px-4 py-3 font-medium',
      render: (item) => (
        <Link href={`/customers/${item.id}`} className="text-left hover:text-blue-600">
          <div className="flex items-center gap-2">
            <span className={memberNameColor(item.membershipStatus)}>{item.fullName}</span>
            <StatusBadge status={item.membershipStatus} />
          </div>
        </Link>
      ),
    },
    {
      key: 'phone',
      label: 'Số điện thoại',
      cellClassName: 'px-4 py-3 text-xs text-zinc-500 dark:text-zinc-400',
      render: (item) => item.phone || '—',
    },
    {
      key: 'membershipStatus',
      label: 'Hạn',
      cellClassName: 'px-4 py-3 text-xs text-zinc-500 dark:text-zinc-400',
      render: (item) => renderMembershipStatus(item),
    },
    {
      label: 'Thao tác',
      cellClassName: 'px-4 py-3',
      render: (item) => renderActions(item),
    },
  ], [renderActions, renderMembershipStatus])

  const memberCardColumns: CardColumn<MemberCustomer>[] = useMemo(() => [
    {
      key: 'fullName',
      label: 'Tên hội viên',
      render: (item) => (
        <Link href={`/customers/${item.id}`} className={`flex items-center gap-2 text-base font-semibold ${memberNameColor(item.membershipStatus)}`}>
          {item.fullName}
          <StatusBadge status={item.membershipStatus} />
        </Link>
      ),
    },
    {
      key: 'phone',
      label: 'SĐT',
      render: (item) => item.phone || '—',
    },
    {
      key: 'membershipStatus',
      label: 'Hạn',
      render: (item) => renderMembershipStatus(item),
    },
    {
      label: '',
      render: (item) => renderActions(item),
    },
  ], [renderActions, renderMembershipStatus])

  const handleRegistered = async () => {
    notifySuccess('Đã đăng ký hội viên')
    setRegisterOpen(false)
    await mutate()
  }

  const handleRenewed = async () => {
    notifySuccess('Đã gia hạn hội viên')
    setRenewMember(null)
    await mutate()
  }

  if (loading) {
    return <AppSkeleton />
  }

  const listHeader = (
    <div className="flex items-center justify-between gap-3">
      <div>
        <h2 className="text-sm font-semibold text-zinc-950 dark:text-white">
          Danh sách hội viên
        </h2>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {filteredMembers.length} người
        </p>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
          <button type="button" aria-pressed={statusFilter === 'ALL'} onClick={() => setStatusFilter('ALL')} className={statusFilter === 'ALL' ? 'font-medium text-blue-600 dark:text-blue-400' : 'text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white'}>Tất cả: {stats.total}</button>
          <button type="button" aria-pressed={statusFilter === 'ACTIVE'} onClick={() => setStatusFilter('ACTIVE')} className={statusFilter === 'ACTIVE' ? 'font-medium text-blue-600 dark:text-blue-400' : 'text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white'}>Còn hạn: {stats.active}</button>
          <button type="button" aria-pressed={statusFilter === 'EXPIRED'} onClick={() => setStatusFilter('EXPIRED')} className={statusFilter === 'EXPIRED' ? 'font-medium text-blue-600 dark:text-blue-400' : 'text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white'}>Hết hạn: {stats.expired}</button>
          <button type="button" aria-pressed={statusFilter === 'NONE'} onClick={() => setStatusFilter('NONE')} className={statusFilter === 'NONE' ? 'font-medium text-blue-600 dark:text-blue-400' : 'text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white'}>Chưa đóng: {stats.none}</button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-full bg-zinc-50 px-4 py-4 dark:bg-zinc-950 md:px-6 md:py-6">
      <div className="mx-auto max-w-content space-y-4">
        <header className="hidden items-center justify-between gap-3 md:flex">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-zinc-950 dark:text-white">
              Hội viên
            </h1>
          </div>
        </header>

        {error && (
          <NoticeCard
            tone="danger"
            title="Không tải được dữ liệu"
            description={error}
          />
        )}

        {!shift && (
          <NoticeCard
            tone="warning"
            title="Chưa mở ca"
            description="Đăng ký và gia hạn hội viên là giao dịch thu tiền, cần mở ca trước."
          />
        )}

        <div className="flex gap-2">
          <Button
            variant="primary"
            size="lg"
            className="flex-1"
            icon={UserPlus}
            disabled={!shift}
            onClick={() => setRegisterOpen(true)}
          >
            Đăng ký hội viên mới
          </Button>
          {canManagePlans && (
            <Link
              href="/membership-plans"
              className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-4 py-3 text-sm font-medium text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
            >
              <Ticket size={16} />
              <span>Gói hội viên</span>
            </Link>
          )}
        </div>

        {/* Mobile: card list */}
        <div className="md:hidden">
          <SortableCardList
            header={listHeader}
            columns={memberCardColumns}
            data={filteredMembers}
            keyExtractor={(m) => m.id}
            search={{
              placeholder: 'Tìm tên hoặc số điện thoại',
              getText: (m) => `${m.fullName} ${m.phone ?? ''}`,
            }}
            sortableKeys={['fullName', 'phone', 'membershipStatus']}
            defaultSortKey="fullName"
            emptyIcon={Users}
            emptyMessage="Không có hội viên"
            emptyDescription="Thử đổi bộ lọc hoặc đăng ký hội viên mới."
          />
        </div>

        {/* Desktop: table */}
        <div className="hidden md:block">
          <SortableTable
            header={listHeader}
            columns={memberColumns}
            data={filteredMembers}
            keyExtractor={(m) => m.id}
            search={{
              placeholder: 'Tìm tên hoặc số điện thoại',
              getText: (m) => `${m.fullName} ${m.phone ?? ''}`,
            }}
            sortableKeys={['fullName', 'phone', 'membershipStatus']}
            defaultSortKey="fullName"
            emptyIcon={Users}
            emptyMessage="Không có hội viên"
            emptyDescription="Thử đổi bộ lọc hoặc đăng ký hội viên mới."
          />
        </div>
      </div>

      <RegisterMemberDialog
        open={registerOpen}
        plans={plans}
        submitting={submitting}
        setSubmitting={setSubmitting}
        onClose={() => setRegisterOpen(false)}
        onDone={handleRegistered}
      />

      <RenewMemberDialog
        member={renewMember}
        plans={plans}
        submitting={submitting}
        setSubmitting={setSubmitting}
        onClose={() => setRenewMember(null)}
        onDone={handleRenewed}
      />

    </div>
  )
}

function memberNameColor(status: MemberStatus) {
  return status === 'EXPIRED' ? 'text-amber-700/70 dark:text-amber-300/70' : 'text-zinc-950 dark:text-white'
}

function StatusBadge({ status }: { status: MemberStatus }) {
  if (status === 'ACTIVE') {
    return (
      <span role="img" aria-label="Còn hạn" title="Còn hạn">
        <Check size={16} strokeWidth={2.5} className="text-emerald-600 dark:text-emerald-400" />
      </span>
    )
  }
  if (status === 'EXPIRED') {
    return (
      <span role="img" aria-label="Hết hạn" title="Hết hạn">
        <X size={16} strokeWidth={2.5} className="text-amber-500 dark:text-amber-400" />
      </span>
    )
  }
  return <Badge variant="danger" size="sm">Chưa đóng</Badge>
}

function RegisterMemberDialog({
  open,
  plans,
  submitting,
  setSubmitting,
  onClose,
  onDone,
}: {
  open: boolean
  plans: MembershipPlan[]
  submitting: boolean
  setSubmitting: (value: boolean) => void
  onClose: () => void
  onDone: () => Promise<void>
}) {
  const { error: notifyError } = useToast()
  // Guard đồng bộ chống double-submit — setSubmitting là async, click nhanh có thể gửi 2 POST trước khi re-render
  const submittingRef = useRef(false)
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [planId, setPlanId] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (!open) return
    /* eslint-disable react-hooks/set-state-in-effect */
    setFullName('')
    setPhone('')
    setPlanId(plans[0]?.id ?? '')
    setPaymentMethod('CASH')
    setNotes('')
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open, plans])

  const selectedPlan = plans.find((plan) => plan.id === planId)

  const submit = async () => {
    // Guard đồng bộ — chặn click trùng ngay lập tức (không chờ setState re-render)
    if (submittingRef.current) return
    if (!fullName.trim()) {
      notifyError('Nhập tên hội viên')
      return
    }
    if (!planId) {
      notifyError('Chưa có gói hội viên')
      return
    }

    submittingRef.current = true
    setSubmitting(true)
    try {
      const data = await apiJson('/api/memberships/register', jsonRequest({
        fullName: fullName.trim(),
        phone: phone.trim(),
        planId,
        paymentMethod,
        notes: notes.trim() || undefined,
      }))
      if (!data.success) {
        notifyError(data.error || 'Không đăng ký được hội viên')
        return
      }
      await onDone()
    } catch {
      notifyError('Lỗi kết nối máy chủ')
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Đăng ký hội viên"
      description="Tạo hồ sơ và thu phí tháng trong cùng giao dịch"
      footer={
        <Button variant="primary" size="lg" fullWidth disabled={submitting} onClick={submit}>
          {submitting ? 'Đang đăng ký...' : 'Đăng ký & thu phí'}
        </Button>
      }
    >
      <MemberPaymentForm
        fullName={fullName}
        phone={phone}
        planId={planId}
        plans={plans}
        paymentMethod={paymentMethod}
        notes={notes}
        selectedPlan={selectedPlan}
        onFullNameChange={setFullName}
        onPhoneChange={setPhone}
        onPlanChange={setPlanId}
        onPaymentMethodChange={setPaymentMethod}
        onNotesChange={setNotes}
        showProfileFields
      />
    </Modal>
  )
}


function MemberPaymentForm({
  fullName,
  phone,
  planId,
  plans,
  paymentMethod,
  notes,
  selectedPlan,
  showProfileFields,
  onFullNameChange,
  onPhoneChange,
  onPlanChange,
  onPaymentMethodChange,
  onNotesChange,
}: {
  fullName?: string
  phone?: string
  planId: string
  plans: MembershipPlan[]
  paymentMethod: PaymentMethod
  notes: string
  selectedPlan?: MembershipPlan
  showProfileFields?: boolean
  onFullNameChange?: (value: string) => void
  onPhoneChange?: (value: string) => void
  onPlanChange: (value: string) => void
  onPaymentMethodChange: (value: PaymentMethod) => void
  onNotesChange: (value: string) => void
}) {
  return (
    <div className="space-y-3">
      {showProfileFields && (
        <>
          <div>
            <Label htmlFor="member-name" required>Họ tên</Label>
            <Input
              id="member-name"
              value={fullName ?? ''}
              onChange={(event) => onFullNameChange?.(event.target.value)}
              placeholder="Tên hội viên"
            />
          </div>
          <div>
            <Label htmlFor="member-phone">Số điện thoại</Label>
            <Input
              id="member-phone"
              value={phone ?? ''}
              onChange={(event) => onPhoneChange?.(event.target.value)}
              placeholder="09..."
            />
          </div>
        </>
      )}

      <div>
        <Label htmlFor="member-plan" required>Gói hội viên</Label>
        <Select
          id="member-plan"
          value={planId}
          onChange={(event) => onPlanChange(event.target.value)}
        >
          {plans.map((plan) => (
            <option key={plan.id} value={plan.id}>
              {plan.name} - {money(plan.price)}
            </option>
          ))}
        </Select>
      </div>

      <PaymentMethodPicker
        key={planId}
        id="member-payment"
        label="Phương thức thanh toán"
        amount={toNumber(selectedPlan?.price)}
        method={paymentMethod}
        onMethodChange={onPaymentMethodChange}
      />

      <div>
        <Label htmlFor="member-notes">Ghi chú</Label>
        <Textarea
          id="member-notes"
          rows={3}
          value={notes}
          onChange={(event) => onNotesChange(event.target.value)}
        />
      </div>

      <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex justify-between text-sm">
          <span className="text-zinc-500 dark:text-zinc-400">Tổng thu</span>
          <span className="font-semibold text-zinc-950 dark:text-white">
            {money(selectedPlan?.price)}
          </span>
        </div>
      </div>
    </div>
  )
}
