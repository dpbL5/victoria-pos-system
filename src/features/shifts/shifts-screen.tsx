'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  ArrowRight,
  Banknote,
  CalendarClock,
  CreditCard,
  History,
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
import { Skeleton, SkeletonPage, SkeletonPanel, SkeletonStats } from '@/components/ui/skeleton'
import { useToast } from '@/components/ui/toast'
import { isAdminOnly, isManagerOrAdmin } from '@/lib/shared/roles'
import { apiJson } from '@/lib/api'
import { usePageRefresh } from '@/components/layout/page-refresh-context'
import { formatClock, formatDay, money } from '@/features/pos/format'
import { getVnDay } from '@/lib/shared/utils'
import type { UserRole, UserSession } from '@/features/pos/types'

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
  weekday?: number
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

  const todayWeekday = getVnDay(new Date())

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
        isAdminOnly(me.data.role)
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

  const { registerRefresh } = usePageRefresh()

  useEffect(() => {
    return registerRefresh(() => void loadData(pagination.page))
  }, [registerRefresh, loadData, pagination.page])

  const isAdmin = isManagerOrAdmin(user?.role)

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

  const isCurrentGroup = (group: DayGroup) =>
    group.weekday !== undefined && group.weekday === todayWeekday

  const upsertParticipant = async (shift: ShiftRow, staffId: string) => {
    setSubmitting(true)
    try {
      const data = await apiJson<ShiftRow>(
        `/api/shifts/${shift.id}/participants`,
        jsonRequest('POST', { staffId })
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

  if (loading) return <ShiftsSkeleton />

  return (
    <div className="min-h-full bg-zinc-50 px-4 py-4 dark:bg-zinc-950 md:px-6 md:py-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <header className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-2xl font-bold text-zinc-950 dark:text-white">
              <CalendarClock size={24} className="text-blue-500" />
              Ca làm
            </h1>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              Lịch sử ca làm {pagination.totalDays > 0 && (
                <>· {pagination.totalDays} ngày gần nhất</>
              )}
            </p>
          </div>
          {pagination.totalPages > 1 && (
            <div className="flex items-center gap-2">
              <span className="text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
                Trang {pagination.page}/{pagination.totalPages}
              </span>
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
          )}
        </header>

        {error && (
          <NoticeCard tone="danger" title="Không tải được dữ liệu" description={error} />
        )}

        <section className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <ShiftStat label={`Ca (${pagination.daysPerPage} ngày)`} value={stats.total} />
          <ShiftStat label="Đang mở" value={stats.open} tone="success" />
          <ShiftStat label="Đã đóng" value={stats.closed} />
          <ShiftStat
            label="Doanh thu"
            value={money(totals.totalRevenue)}
            tone="blue"
          />
        </section>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Input
            aria-label="Tìm ca làm"
            value={searchInput}
            onChange={(event) => {
              const next = event.target.value
              setSearchInput(next)
              if (next === '') setSearchQuery('')
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                setSearchQuery(searchInput)
              }
            }}
            placeholder="Tìm theo tên nhân viên hoặc mã ca"
            className="sm:max-w-xs"
          />
          <div className="flex gap-2 overflow-x-auto pb-1">
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
        </div>

        <section className="space-y-3">
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
                isCurrentDay={isCurrentGroup(group)}
                canManageParticipants={!!isAdmin}
                submitting={submitting}
                onManage={setManageShift}
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
  isCurrentDay,
  canManageParticipants,
  submitting,
  onManage,
  onRemove,
}: {
  group: DayGroup
  isCurrentDay: boolean
  canManageParticipants: boolean
  submitting: boolean
  onManage: (shift: ShiftRow) => void
  onRemove: (shift: ShiftRow, participant: ShiftParticipantRow) => void
}) {
  const dayLabel = new Date(group.date).toLocaleDateString('vi-VN', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })

  return (
    <section className="space-y-2">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-zinc-200 pb-2 dark:border-zinc-800">
        {isCurrentDay && <Badge variant="purple" size="sm">Hôm nay</Badge>}
        <h3 className="text-sm font-semibold capitalize text-zinc-950 dark:text-white">
          {dayLabel}
        </h3>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          {group.shifts.length} ca
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
          <span className="inline-flex items-center gap-1 tabular-nums">
            <Banknote size={12} />
            {money(group.totalRevenue)}
          </span>
          <span className="inline-flex items-center gap-1 tabular-nums">
            <CreditCard size={12} />
            {group.paymentCount + group.membershipCount} GD
          </span>
          <span className="tabular-nums">{group.sessionCount} phiên</span>
        </div>
      </header>

      <ul className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm divide-y divide-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:divide-zinc-800">
        {group.shifts.map((shift) => (
          <li key={shift.id}>
            <ShiftCard
              shift={shift}
              canManageParticipants={canManageParticipants && shift.status === 'OPEN'}
              submitting={submitting}
              onManage={() => onManage(shift)}
              onRemove={(p) => onRemove(shift, p)}
            />
          </li>
        ))}
      </ul>
    </section>
  )
}

function ShiftCard({
  shift,
  canManageParticipants,
  submitting,
  onManage,
  onRemove,
}: {
  shift: ShiftRow
  canManageParticipants: boolean
  submitting: boolean
  onManage: () => void
  onRemove: (participant: ShiftParticipantRow) => void
}) {
  const activeParticipants = (shift.participants ?? []).filter((p) => !p.leftAt)
  const pastParticipants = (shift.participants ?? []).filter((p) => p.leftAt)
  const duration = formatShiftDuration(shift.openedAt, shift.closedAt)

  const transactionsHref = `/transactions?shiftId=${shift.id}`

  return (
    <Link
      href={transactionsHref}
      className="group relative grid grid-cols-[4px_1fr] transition-colors hover:bg-zinc-50 focus-visible:bg-zinc-50 dark:hover:bg-zinc-800/40 dark:focus-visible:bg-zinc-800/40"
    >
      <div className={shift.status === 'OPEN' ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-700'} />
      <div className="px-3 py-3">
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={shift.status === 'OPEN' ? 'success' : 'default'} size="sm">
                {shift.status === 'OPEN' ? 'Đang mở' : 'Đã đóng'}
              </Badge>
              <h4 className="text-sm font-semibold text-zinc-950 dark:text-white">
                Ca {formatClock(shift.openedAt)}
                {shift.closedAt ? ` - ${formatClock(shift.closedAt)}` : ''}
              </h4>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">· {duration}</span>
            </div>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Mở bởi <span className="font-medium text-zinc-700 dark:text-zinc-300">{shift.staff?.fullName ?? 'Không rõ'}</span>
            </p>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              <span className="tabular-nums">{shift._count?.payments ?? 0}</span> giao dịch
              {shift._count?.sessions !== undefined && (
                <> · <span className="tabular-nums">{shift._count.sessions}</span> phiên</>
              )}
            </p>
          </div>

          {canManageParticipants && (
            <Button
              variant="secondary"
              size="xs"
              icon={UserRoundPlus}
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                onManage()
              }}
            >
              NV
            </Button>
          )}
        </div>

        {shift.toolStats && (
          <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            <span>
              Dụng cụ: <span className="font-semibold text-zinc-700 dark:text-zinc-300">{shift.toolStats.total}</span> món
            </span>
            <span className="ml-2 text-emerald-600 dark:text-emerald-400">
              Khớp {shift.toolStats.matched}
            </span>
            {shift.toolStats.mismatched > 0 && (
              <span className="ml-2 text-amber-600 dark:text-amber-400">
                Lệch {shift.toolStats.mismatched}
              </span>
            )}
          </div>
        )}

        {(activeParticipants.length > 0 || pastParticipants.length > 0) && (
          <div className="mt-2 flex flex-wrap items-center gap-1">
            {activeParticipants.map((p) => (
              <ParticipantPill
                key={p.id}
                participant={p}
                canManage={canManageParticipants}
                submitting={submitting}
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
    </Link>
  )
}

function ParticipantPill({
  participant,
  canManage,
  submitting,
  onRemove,
}: {
  participant: ShiftParticipantRow
  canManage: boolean
  submitting: boolean
  onRemove: (participant: ShiftParticipantRow) => void
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-xs dark:border-zinc-700 dark:bg-zinc-800">
      <span className="max-w-[100px] truncate font-medium text-zinc-950 dark:text-white">
        {participant.staff.fullName}
      </span>
      {canManage && !participant.leftAt && (
        <span className="ml-0.5 flex gap-0.5">
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
  onSubmit: (shift: ShiftRow, staffId: string) => Promise<void>
}) {
  const [staffId, setStaffId] = useState('')

  useEffect(() => {
    if (!shift) return
    setStaffId('')
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
          onClick={() => { if (shift) void onSubmit(shift, staffId) }}
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
    <SkeletonPage>
      <Skeleton className="h-10 w-36" />
      <SkeletonStats />
      <SkeletonPanel><Skeleton className="h-28 w-full" /></SkeletonPanel>
      <SkeletonPanel className="space-y-3">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </SkeletonPanel>
      <SkeletonPanel className="space-y-3">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-20 w-full" />
      </SkeletonPanel>
    </SkeletonPage>
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
