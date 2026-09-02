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
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { FilterButton } from '@/components/ui/filter-button'
import { Input } from '@/components/ui/input'
import { NoticeCard } from '@/components/ui/notice-card'
import { Skeleton, SkeletonPage, SkeletonPanel } from '@/components/ui/skeleton'
import { usePageRefresh } from '@/components/layout/page-refresh-context'
import { formatClock, money } from '@/features/pos/format'
import { getVnDay } from '@/lib/shared/utils'

type ShiftStatusFilter = 'ALL' | 'OPEN' | 'CLOSED'

interface ShiftParticipantRow {
  id: string
  leftAt?: string | null
  staff: {
    fullName: string
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
  const [dayGroups, setDayGroups] = useState<DayGroup[]>([])
  const [pagination, setPagination] = useState({ page: 1, daysPerPage: 7, totalDays: 0, totalPages: 0 })
  const [statusFilter, setStatusFilter] = useState<ShiftStatusFilter>('ALL')
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const todayWeekday = getVnDay(new Date())

  const loadData = useCallback(async (page: number) => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({
        groupBy: 'day',
        daysPerPage: '7',
        page: String(page),
      })
      if (statusFilter !== 'ALL') params.set('status', statusFilter)

      const shiftData = await fetch(`/api/shifts?${params.toString()}`).then((r) => r.json()) as DayGroupsResponse

      if (!shiftData.success) throw new Error(shiftData.error || 'Không tải được ca làm')

      setDayGroups(shiftData.data ?? [])
      if (shiftData.pagination) setPagination(shiftData.pagination)
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

  const isCurrentGroup = (group: DayGroup) =>
    group.weekday !== undefined && group.weekday === todayWeekday

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
              <DayGroupSection key={group.date} group={group} isCurrentDay={isCurrentGroup(group)} />
            ))
          )}
        </section>
      </div>
    </div>
  )
}

function DayGroupSection({
  group,
  isCurrentDay,
}: {
  group: DayGroup
  isCurrentDay: boolean
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
            <ShiftCard shift={shift} />
          </li>
        ))}
      </ul>
    </section>
  )
}

function ShiftCard({ shift }: { shift: ShiftRow }) {
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
              <span
                key={p.id}
                className="inline-flex items-center rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-xs dark:border-zinc-700 dark:bg-zinc-800"
              >
                <span className="max-w-[100px] truncate font-medium text-zinc-950 dark:text-white">
                  {p.staff.fullName}
                </span>
              </span>
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

function ShiftsSkeleton() {
  return (
    <SkeletonPage>
      <Skeleton className="h-10 w-36" />
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
