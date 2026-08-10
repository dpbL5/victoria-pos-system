'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  ArrowRight,
  Banknote,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CreditCard,
  History,
  ReceiptText,
  RefreshCw,
  UserMinus,
  UserRoundPlus,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { FilterButton } from '@/components/ui/filter-button'
import { Input, Label, Select } from '@/components/ui/input'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Modal } from '@/components/ui/modal'
import { NoticeCard } from '@/components/ui/notice-card'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/components/ui/toast'
import { apiJson } from '@/lib/api'
import { formatClock, formatDay, money, paymentMethodLabel, toNumber } from '@/features/pos/format'
import { toInputDate } from '@/lib/shared/utils'
import type { PaymentMethod, ShiftParticipantRole, UserRole, UserSession } from '@/features/pos/types'

interface TransactionItem {
  id: string
  type: 'payment' | 'membership'
  amount: number
  paymentMethod: string | null
  paidAt: string
  customerName: string
  customerType: string | null
  invoiceId: string | null
  invoiceNo: string | null
  staffName: string
  planName: string | null
}

type ShiftStatusFilter = 'ALL' | 'OPEN' | 'CLOSED'

interface UserRow {
  id: string
  username: string
  fullName: string
  role: UserRole
  isActive: boolean
}

interface ShiftParticipantRow {
  id: string
  role: ShiftParticipantRole
  joinedAt: string
  leftAt?: string | null
  staffId: string
  staff: {
    id: string
    username?: string
    fullName: string
    role?: UserRole
    isActive?: boolean
  }
}

interface ShiftRow {
  id: string
  staffId: string
  staff?: { id: string; fullName: string }
  openedAt: string
  closedAt?: string | null
  openingCash: number | string
  closingCash?: number | string | null
  expectedCash?: number | string | null
  cashDifference?: number | string | null
  status: 'OPEN' | 'CLOSED'
  notes?: string | null
  participants?: ShiftParticipantRow[]
  _count?: {
    sessions: number
    payments: number
    membershipPayments: number
  }
  toolCounts?: Array<{
    id: string
    toolId: string
    tool: { id: string; name: string; quantity: number; isRequired: boolean }
    openCount: number
    closeCount: number | null
  }>
  toolStats?: {
    total: number
    matched: number
    mismatched: number
  }
}

interface DayGroup {
  date: string
  totalRevenue: number
  cashRevenue: number
  transferRevenue: number
  cardRevenue: number
  paymentCount: number
  membershipCount: number
  sessionCount: number
  shifts: ShiftRow[]
}

interface DayGroupsResponse {
  success: boolean
  data?: DayGroup[]
  pagination?: { page: number; daysPerPage: number; totalDays: number; totalPages: number }
  error?: string
}

export function ShiftsScreen() {
  const { success: notifySuccess, error: notifyError } = useToast()
  const [user, setUser] = useState<UserSession | null>(null)
  const [users, setUsers] = useState<UserRow[]>([])
  const [dayGroups, setDayGroups] = useState<DayGroup[]>([])
  const [pagination, setPagination] = useState({ page: 1, daysPerPage: 7, totalDays: 0, totalPages: 0 })
  const [statusFilter, setStatusFilter] = useState<ShiftStatusFilter>('ALL')
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [manageShift, setManageShift] = useState<ShiftRow | null>(null)
  const [removingParticipant, setRemovingParticipant] = useState<{ shift: ShiftRow; participant: ShiftParticipantRow } | null>(null)
  const [txShift, setTxShift] = useState<ShiftRow | null>(null)
  const [txDialogOpen, setTxDialogOpen] = useState(false)
  const [txList, setTxList] = useState<TransactionItem[]>([])
  const [txLoading, setTxLoading] = useState(false)

  const todayStr = toInputDate(new Date())

  const loadData = useCallback(async (page: number) => {
    setLoading(true)
    setError('')
    try {
      const me = await apiJson<UserSession>('/api/auth/me')
      if (!me.success || !me.data) throw new Error(me.error || 'Không tải được tài khoản')

      const params = new URLSearchParams({
        groupBy: 'day',
        daysPerPage: '7',
        page: String(page),
      })
      if (statusFilter !== 'ALL') params.set('status', statusFilter)

      const [shiftData, userData] = await Promise.all([
        fetch(`/api/shifts?${params.toString()}`).then((r) => r.json()) as Promise<DayGroupsResponse>,
        me.data.role === 'ADMIN'
          ? apiJson<UserRow[]>('/api/users')
          : Promise.resolve({ success: true, data: [] as UserRow[], error: undefined }),
      ])

      if (!shiftData.success) throw new Error(shiftData.error || 'Không tải được ca làm')
      if (!userData.success) throw new Error(userData.error || 'Không tải được nhân viên')

      setUser(me.data)
      setDayGroups(shiftData.data ?? [])
      if (shiftData.pagination) setPagination(shiftData.pagination)
      setUsers((userData.data ?? []).filter((item) => item.isActive))
    } catch (err) {
      setError((err as Error).message || 'Lỗi kết nối máy chủ')
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  useEffect(() => {
    void loadData(1)
  }, [loadData])

  const isAdmin = user?.role === 'ADMIN'

  const allShifts = useMemo(() => dayGroups.flatMap((g) => g.shifts), [dayGroups])

  const stats = useMemo(() => {
    const open = allShifts.filter((s) => s.status === 'OPEN').length
    const closed = allShifts.filter((s) => s.status === 'CLOSED').length
    return { total: open + closed, open, closed }
  }, [allShifts])

  const totals = useMemo(() => {
    let totalRevenue = 0
    let cashRevenue = 0
    let transferRevenue = 0
    let cardRevenue = 0
    let paymentCount = 0
    let membershipCount = 0
    let sessionCount = 0
    for (const g of dayGroups) {
      totalRevenue += g.totalRevenue
      cashRevenue += g.cashRevenue
      transferRevenue += g.transferRevenue
      cardRevenue += g.cardRevenue
      paymentCount += g.paymentCount
      membershipCount += g.membershipCount
      sessionCount += g.sessionCount
    }
    return { totalRevenue, cashRevenue, transferRevenue, cardRevenue, paymentCount, membershipCount, sessionCount }
  }, [dayGroups])

  const visibleGroups = useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase()
    if (!keyword) return dayGroups

    return dayGroups.map((group) => ({
      ...group,
      shifts: group.shifts.filter((shift) => {
        const names = [
          shift.staff?.fullName,
          ...(shift.participants ?? []).map((p) => p.staff.fullName),
        ]
        return names.some((name) => name?.toLowerCase().includes(keyword))
          || shift.id.toLowerCase().includes(keyword)
      }),
    })).filter((group) => group.shifts.length > 0)
  }, [searchQuery, dayGroups])

  const replaceShift = (updated: ShiftRow) => {
    setDayGroups((current) => current.map((group) => ({
      ...group,
      shifts: group.shifts.map((s) => (s.id === updated.id ? updated : s)),
    })))
    setManageShift((current) => (current?.id === updated.id ? updated : current))
  }

  const upsertParticipant = async (shift: ShiftRow, staffId: string, role: ShiftParticipantRole) => {
    setSubmitting(true)
    try {
      const data = await apiJson<ShiftRow>(
        `/api/shifts/${shift.id}/participants`,
        jsonRequest('POST', { staffId, role })
      )
      if (!data.success || !data.data) {
        notifyError(data.error || 'Không cập nhật được nhân viên trong ca')
        return
      }
      replaceShift(data.data)
      notifySuccess('Đã cập nhật nhân viên trong ca')
    } catch {
      notifyError('Lỗi kết nối máy chủ')
    } finally {
      setSubmitting(false)
    }
  }

  const confirmRemoveParticipant = async () => {
    if (!removingParticipant) return
    const { shift, participant } = removingParticipant
    setSubmitting(true)
    try {
      const data = await apiJson<ShiftRow>(
        `/api/shifts/${shift.id}/participants`,
        jsonRequest('DELETE', { staffId: participant.staffId })
      )
      if (!data.success || !data.data) {
        notifyError(data.error || 'Không xoá được nhân viên khỏi ca')
        return
      }
      replaceShift(data.data)
      notifySuccess('Đã cho nhân viên rời ca')
      setRemovingParticipant(null)
    } catch {
      notifyError('Lỗi kết nối máy chủ')
    } finally {
      setSubmitting(false)
    }
  }

  const loadTransactions = async (shift: ShiftRow) => {
    setTxShift(shift)
    setTxDialogOpen(true)
    setTxLoading(true)
    try {
      const data = await apiJson<{ transactions: TransactionItem[] }>(
        `/api/shifts/${shift.id}/transactions`
      )
      if (!data.success) {
        notifyError(data.error || 'Không tải được giao dịch')
        return
      }
      setTxList(data.data?.transactions ?? [])
    } catch {
      notifyError('Lỗi kết nối máy chủ')
    } finally {
      setTxLoading(false)
    }
  }

  if (loading) return <ShiftsSkeleton />

  return (
    <div className="min-h-full bg-zinc-50 px-4 py-4 dark:bg-zinc-950 md:px-6 md:py-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <header className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Quản lý ca
            </p>
            <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold text-zinc-950 dark:text-white">
              <CalendarClock size={24} className="text-blue-500" />
              Ca làm
            </h1>
          </div>
          <Button
            variant="secondary"
            size="sm"
            icon={RefreshCw}
            onClick={() => void loadData(pagination.page)}
            title="Làm mới"
          />
        </header>

        {error && (
          <NoticeCard tone="danger" title="Không tải được dữ liệu" description={error} />
        )}

        <section className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <ShiftStat label="Tổng ca" value={stats.total} />
          <ShiftStat label="Đang mở" value={stats.open} tone="success" />
          <ShiftStat label="Đã đóng" value={stats.closed} />
          <ShiftStat
            label={`${pagination.totalDays} ngày`}
            value={totals.sessionCount}
            tone="blue"
          />
        </section>

        <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
            <div>
              <Label htmlFor="shift-search">Tìm ca làm</Label>
              <div className="flex gap-2">
                <Input
                  id="shift-search"
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      setSearchQuery(searchInput)
                    }
                  }}
                  placeholder="Tên nhân viên hoặc mã ca"
                />
                <Button variant="secondary" onClick={() => setSearchQuery(searchInput)}>
                  Tìm
                </Button>
              </div>
            </div>
            <Link href="/sessions">
              <Button variant="inverse" icon={ArrowRight}>
                Mở ca hôm nay
              </Button>
            </Link>
          </div>

          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            <FilterButton active={statusFilter === 'ALL'} onClick={() => setStatusFilter('ALL')}>
              Tất cả
            </FilterButton>
            <FilterButton active={statusFilter === 'OPEN'} onClick={() => setStatusFilter('OPEN')}>
              Đang mở
            </FilterButton>
            <FilterButton active={statusFilter === 'CLOSED'} onClick={() => setStatusFilter('CLOSED')}>
              Đã đóng
            </FilterButton>
          </div>
        </section>

        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              Trang {pagination.page}/{pagination.totalPages} · {pagination.totalDays} ngày
            </span>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="xs"
                icon={ArrowLeft}
                disabled={pagination.page <= 1 || loading}
                onClick={() => loadData(pagination.page - 1)}
              >
                Trước
              </Button>
              <Button
                variant="secondary"
                size="xs"
                icon={ArrowRight}
                disabled={pagination.page >= pagination.totalPages || loading}
                onClick={() => loadData(pagination.page + 1)}
              >
                Sau
              </Button>
            </div>
          </div>
        )}

        <section className="space-y-4">
          {visibleGroups.length === 0 ? (
            <div className="rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <EmptyState
                icon={History}
                message="Chưa có ca làm"
                description="Mở ca ở màn Ca hôm nay để bắt đầu ghi nhận lịch sử."
              />
            </div>
          ) : (
            visibleGroups.map((group) => (
              <DayGroupSection
                key={group.date}
                group={group}
                isToday={group.date === todayStr}
                canManageParticipants={!!isAdmin}
                submitting={submitting}
                onManage={setManageShift}
                onViewTransactions={(shift) => void loadTransactions(shift)}
                onRoleChange={upsertParticipant}
                onRemove={(shift, participant) => setRemovingParticipant({ shift, participant })}
              />
            ))
          )}
        </section>
      </div>

      <ManageParticipantsDialog
        shift={manageShift}
        users={users}
        submitting={submitting}
        onClose={() => setManageShift(null)}
        onSubmit={upsertParticipant}
      />

      <TransactionsDialog
        shift={txShift}
        transactions={txList}
        loading={txLoading}
        onClose={() => setTxDialogOpen(false)}
        open={txDialogOpen}
      />

      <ConfirmDialog
        open={!!removingParticipant}
        onClose={() => setRemovingParticipant(null)}
        title="Cho nhân viên rời ca"
        description={removingParticipant ? `Nhân viên "${removingParticipant.participant.staff.fullName}" sẽ rời khỏi ca.` : undefined}
        body={
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Nhân viên có đang làm việc sẽ không thể thu ngân cho ca này sau khi rời ca.
          </p>
        }
        confirmLabel="Xác nhận"
        submitting={submitting}
        onConfirm={confirmRemoveParticipant}
      />
    </div>
  )
}

function DayGroupSection({
  group,
  isToday,
  canManageParticipants,
  submitting,
  onManage,
  onViewTransactions,
  onRoleChange,
  onRemove,
}: {
  group: DayGroup
  isToday: boolean
  canManageParticipants: boolean
  submitting: boolean
  onManage: (shift: ShiftRow) => void
  onViewTransactions: (shift: ShiftRow) => void
  onRoleChange: (shift: ShiftRow, staffId: string, role: ShiftParticipantRole) => Promise<void>
  onRemove: (shift: ShiftRow, participant: ShiftParticipantRow) => void
}) {
  const dayLabel = new Date(group.date).toLocaleDateString('vi-VN', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })

  return (
    <div className={`overflow-hidden rounded-xl border shadow-sm ${
      isToday
        ? 'border-blue-300 bg-blue-50/50 dark:border-blue-500/30 dark:bg-blue-500/5'
        : 'border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900'
    }`}>
      <div className="border-b px-4 py-3 dark:border-zinc-800">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            {isToday && <Badge variant="purple" size="sm">Hôm nay</Badge>}
            <h3 className="text-sm font-semibold capitalize text-zinc-950 dark:text-white">
              {dayLabel}
            </h3>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              {group.shifts.length} ca
            </span>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
            <span className="inline-flex items-center gap-1">
              <Banknote size={12} />
              {money(group.totalRevenue)}
            </span>
            <span className="inline-flex items-center gap-1">
              <CreditCard size={12} />
              {group.paymentCount + group.membershipCount} GD
            </span>
            <span>{group.sessionCount} phiên</span>
          </div>
        </div>
      </div>

      <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {group.shifts.map((shift) => (
          <ShiftCard
            key={shift.id}
            shift={shift}
            canManageParticipants={canManageParticipants && shift.status === 'OPEN'}
            submitting={submitting}
            onManage={() => onManage(shift)}
            onViewTransactions={() => onViewTransactions(shift)}
            onRoleChange={(p, role) => onRoleChange(shift, p.staffId, role)}
            onRemove={(p) => onRemove(shift, p)}
          />
        ))}
      </div>
    </div>
  )
}

function ShiftCard({
  shift,
  canManageParticipants,
  submitting,
  onManage,
  onViewTransactions,
  onRoleChange,
  onRemove,
}: {
  shift: ShiftRow
  canManageParticipants: boolean
  submitting: boolean
  onManage: () => void
  onViewTransactions: () => void
  onRoleChange: (participant: ShiftParticipantRow, role: ShiftParticipantRole) => void
  onRemove: (participant: ShiftParticipantRow) => void
}) {
  const activeParticipants = (shift.participants ?? []).filter((p) => !p.leftAt)
  const pastParticipants = (shift.participants ?? []).filter((p) => p.leftAt)
  const duration = formatShiftDuration(shift.openedAt, shift.closedAt)

  return (
    <div className="grid grid-cols-[4px_1fr]">
      <div className={shift.status === 'OPEN' ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-700'} />
      <div className="p-3">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={shift.status === 'OPEN' ? 'success' : 'default'} size="sm">
                {shift.status === 'OPEN' ? 'Đang mở' : 'Đã đóng'}
              </Badge>
              <h4 className="text-sm font-medium text-zinc-950 dark:text-white">
                Ca {formatClock(shift.openedAt)}
                {shift.closedAt ? ` - ${formatClock(shift.closedAt)}` : ''}
              </h4>
            </div>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
              <span>{duration}</span>
              <span>Mở bởi {shift.staff?.fullName ?? 'Không rõ'}</span>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="secondary" size="xs" icon={ReceiptText} onClick={onViewTransactions}>
              GD
            </Button>
            {canManageParticipants && (
              <Button variant="secondary" size="xs" icon={UserRoundPlus} onClick={onManage}>
                NV
              </Button>
            )}
          </div>
        </div>

        <div className="mt-2 grid grid-cols-3 gap-2 md:grid-cols-5">
          <MoneyMini label="Đầu ca" value={shift.openingCash} />
          <MoneyMini label="Dự kiến" value={shift.expectedCash} />
          <MoneyMini label="Cuối ca" value={shift.closingCash} />
          <MoneyMini
            label="Chênh"
            value={shift.cashDifference}
            warning={toNumber(shift.cashDifference) !== 0}
          />
          <div className="rounded bg-zinc-50 px-2 py-1 dark:bg-zinc-950">
            <p className="text-[10px] text-zinc-500 dark:text-zinc-400">GD</p>
            <p className="text-xs font-semibold tabular-nums text-zinc-950 dark:text-white">
              {(shift._count?.payments ?? 0) + (shift._count?.membershipPayments ?? 0)}
            </p>
          </div>
        </div>

        {shift.toolStats && (
          <details className="group mt-2">
            <summary className="cursor-pointer list-none rounded-lg bg-zinc-50 p-2 transition-colors hover:bg-zinc-100 dark:bg-zinc-950 dark:hover:bg-zinc-900">
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <span className="text-[10px] text-zinc-400">Dụng cụ</span>
                  <p className="flex items-center gap-1 text-xs font-semibold">
                    <ChevronRight size={12} className="group-open:hidden" />
                    <ChevronDown size={12} className="hidden group-open:block" />
                    {shift.toolStats.total} món
                  </p>
                </div>
                <div>
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400">Khớp</span>
                  <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">{shift.toolStats.matched}</p>
                </div>
                <div>
                  <span className="text-[10px] text-amber-600 dark:text-amber-400">Lệch</span>
                  <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">{shift.toolStats.mismatched}</p>
                </div>
              </div>
            </summary>
            {shift.toolCounts && shift.toolCounts.length > 0 && (
              <div className="mt-1 space-y-1 rounded-lg bg-white p-2 dark:bg-zinc-900">
                {shift.toolCounts.map((tc) => {
                  const diff = tc.closeCount != null ? tc.closeCount - tc.openCount : null
                  return (
                    <div key={tc.id} className="flex items-center justify-between gap-2 py-1 text-xs">
                      <span className="text-zinc-700 dark:text-zinc-300">{tc.tool.name}</span>
                      <span className="tabular-nums text-zinc-500">
                        Mở: {tc.openCount}
                        {tc.closeCount != null && <> · Đóng: {tc.closeCount}</>}
                        {diff != null && (
                          <span className={diff === 0 ? 'ml-1 text-emerald-600' : 'ml-1 text-amber-600'}>
                            ({diff > 0 ? `+${diff}` : diff})
                          </span>
                        )}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </details>
        )}

        {(activeParticipants.length > 0 || pastParticipants.length > 0) && (
          <div className="mt-2 flex flex-wrap items-center gap-1">
            {activeParticipants.map((p) => (
              <ParticipantPill
                key={p.id}
                participant={p}
                canManage={canManageParticipants}
                submitting={submitting}
                onRoleChange={onRoleChange}
                onRemove={onRemove}
              />
            ))}
            {pastParticipants.length > 0 && (
              <span className="inline-flex items-center rounded-full border border-zinc-200 px-2 py-0.5 text-[10px] text-zinc-400 dark:border-zinc-700">
                +{pastParticipants.length} đã rời
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function MoneyMini({
  label,
  value,
  warning,
}: {
  label: string
  value: number | string | null | undefined
  warning?: boolean
}) {
  return (
    <div className="rounded bg-zinc-50 px-2 py-1 dark:bg-zinc-950">
      <p className="text-[10px] text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className={`text-xs font-semibold tabular-nums ${
        warning ? 'text-amber-600 dark:text-amber-300' : 'text-zinc-950 dark:text-white'
      }`}>
        {money(value ?? 0)}
      </p>
    </div>
  )
}

function ParticipantPill({
  participant,
  canManage,
  submitting,
  onRoleChange,
  onRemove,
}: {
  participant: ShiftParticipantRow
  canManage: boolean
  submitting: boolean
  onRoleChange: (participant: ShiftParticipantRow, role: ShiftParticipantRole) => void
  onRemove: (participant: ShiftParticipantRow) => void
}) {
  const nextRole: ShiftParticipantRole = participant.role === 'LEAD' ? 'STAFF' : 'LEAD'

  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-xs dark:border-zinc-700 dark:bg-zinc-800">
      <span className="max-w-[100px] truncate font-medium text-zinc-950 dark:text-white">
        {participant.staff.fullName}
      </span>
      {participant.role === 'LEAD' && (
        <span className="text-[10px] text-purple-600 dark:text-purple-400">TC</span>
      )}
      {canManage && !participant.leftAt && (
        <span className="ml-0.5 flex gap-0.5">
          <button
            type="button"
            disabled={submitting}
            onClick={() => onRoleChange(participant, nextRole)}
            className="rounded p-0.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
            title={participant.role === 'LEAD' ? 'Chuyển thành NV' : 'Chuyển thành TC'}
          >
            <CheckCircle2 size={10} />
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => onRemove(participant)}
            className="rounded p-0.5 text-zinc-400 hover:text-red-500"
            title="Cho rời ca"
          >
            <UserMinus size={10} />
          </button>
        </span>
      )}
    </span>
  )
}

function ManageParticipantsDialog({
  shift,
  users,
  submitting,
  onClose,
  onSubmit,
}: {
  shift: ShiftRow | null
  users: UserRow[]
  submitting: boolean
  onClose: () => void
  onSubmit: (shift: ShiftRow, staffId: string, role: ShiftParticipantRole) => Promise<void>
}) {
  const [staffId, setStaffId] = useState('')
  const [role, setRole] = useState<ShiftParticipantRole>('STAFF')

  useEffect(() => {
    if (!shift) return
    setStaffId('')
    setRole('STAFF')
  }, [shift])

  const availableUsers = users.filter((u) => u.isActive)

  return (
    <Modal
      open={!!shift}
      onClose={onClose}
      title="Quản lý nhân viên trong ca"
      description={shift ? `Ca mở lúc ${formatClock(shift.openedAt)} ngày ${formatDay(shift.openedAt)}` : undefined}
      footer={
        <Button
          variant="inverse"
          size="lg"
          fullWidth
          disabled={submitting || !staffId}
          onClick={() => { if (shift) void onSubmit(shift, staffId, role) }}
        >
          {submitting ? 'Đang cập nhật...' : 'Thêm hoặc cập nhật'}
        </Button>
      }
    >
      <div className="space-y-3">
        <div>
          <Label htmlFor="shift-staff" required>Nhân viên</Label>
          <Select
            id="shift-staff"
            value={staffId}
            onChange={(event) => setStaffId(event.target.value)}
          >
            <option value="">Chọn nhân viên</option>
            {availableUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.fullName} · {u.username}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="shift-role">Vai trò trong ca</Label>
          <Select
            id="shift-role"
            value={role}
            onChange={(event) => setRole(event.target.value as ShiftParticipantRole)}
          >
            <option value="STAFF">Nhân viên</option>
            <option value="LEAD">Trưởng ca</option>
          </Select>
        </div>
      </div>
    </Modal>
  )
}

function ShiftStat({
  label,
  value,
  tone = 'default',
}: {
  label: string
  value: number | string
  tone?: 'success' | 'blue' | 'default'
}) {
  const valueClass = tone === 'success'
    ? 'text-emerald-600 dark:text-emerald-300'
    : tone === 'blue'
      ? 'text-blue-600 dark:text-blue-300'
      : 'text-zinc-950 dark:text-white'

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-[11px] text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className={`mt-1 text-xl font-bold tabular-nums ${valueClass}`}>{value}</p>
    </div>
  )
}

function ShiftsSkeleton() {
  return (
    <div className="min-h-full space-y-4 p-4 md:p-6">
      <Skeleton className="h-10 w-36" />
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </div>
      <Skeleton className="h-28 w-full" />
      <Skeleton className="h-64 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  )
}

function jsonRequest(method: 'POST' | 'DELETE', body: unknown): RequestInit {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const csrfToken = typeof document !== 'undefined'
    ? document.cookie.match(/(?:^|;\s*)qltrungcung_csrf=([^;]*)/)?.[1]
    : null
  if (csrfToken) headers['X-CSRF-Token'] = decodeURIComponent(csrfToken)
  return { method, headers, body: JSON.stringify(body) }
}

function formatShiftDuration(openedAt: string, closedAt?: string | null): string {
  const start = new Date(openedAt).getTime()
  const end = closedAt ? new Date(closedAt).getTime() : Date.now()
  const totalMinutes = Math.max(0, Math.round((end - start) / 60000))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours === 0) return `${minutes} phút`
  if (minutes === 0) return `${hours} giờ`
  return `${hours} giờ ${minutes} phút`
}

function TransactionsDialog({
  shift,
  transactions,
  loading,
  onClose,
  open,
}: {
  shift: ShiftRow | null
  transactions: TransactionItem[]
  loading: boolean
  onClose: () => void
  open: boolean
}) {
  const router = useRouter()
  const totalAmount = transactions.reduce((sum, t) => sum + t.amount, 0)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={shift ? `Giao dịch ca ${formatDay(shift.openedAt)}` : 'Giao dịch trong ca'}
      description={shift ? `Mở lúc ${formatClock(shift.openedAt)} · ${transactions.length} giao dịch · Tổng ${money(totalAmount)}` : undefined}
      size="lg"
    >
      <div className="max-h-[60vh] divide-y divide-zinc-100 overflow-y-auto dark:divide-zinc-800">
        {loading ? (
          <div className="p-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
            Đang tải giao dịch...
          </div>
        ) : transactions.length === 0 ? (
          <div className="p-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
            Chưa có giao dịch nào trong ca.
          </div>
        ) : (
          transactions.map((tx) => (
            <button
              key={`${tx.type}-${tx.id}`}
              type="button"
              disabled={!tx.invoiceId}
              onClick={() => {
                if (tx.invoiceId) router.push(`/invoices/${tx.invoiceId}`)
              }}
              className="grid w-full grid-cols-[1fr_auto] gap-3 px-4 py-3 text-left transition-colors hover:bg-zinc-50 disabled:cursor-default disabled:hover:bg-transparent dark:hover:bg-zinc-800/50"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-semibold text-zinc-950 dark:text-white">
                    {tx.customerName}
                  </p>
                  {tx.type === 'membership' ? (
                    <Badge variant="purple" size="sm">Hội viên</Badge>
                  ) : tx.customerType === 'MEMBER' ? (
                    <Badge variant="purple" size="sm">HV</Badge>
                  ) : (
                    <Badge variant="default" size="sm">VL</Badge>
                  )}
                </div>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  {formatClock(tx.paidAt)}
                  {tx.invoiceNo ? ` · ${tx.invoiceNo}` : ''}
                  {tx.type === 'membership' && tx.planName ? ` · ${tx.planName}` : ''}
                  {' · '}
                  {tx.type === 'membership' ? 'Phí hội viên' : tx.paymentMethod ? paymentMethodLabel(tx.paymentMethod as PaymentMethod) : ''}
                </p>
              </div>
              <p className="self-center text-sm font-bold tabular-nums text-zinc-950 dark:text-white">
                {money(tx.amount)}
              </p>
            </button>
          ))
        )}
      </div>
    </Modal>
  )
}
