'use client'

import { useMemo, useState } from 'react'
import { Search, UserPlus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NoticeCard } from '@/components/ui/notice-card'
import { Skeleton } from '@/components/ui/skeleton'
import { SortableCardList, type Column } from '@/components/ui/sortable-card-list'
import { useApi } from '@/hooks/use-api'
import { formatDay, money } from '@/features/pos/format'
import type { Customer, Membership, Shift } from '@/features/pos/types'

type MemberStatus = 'ACTIVE' | 'EXPIRED' | 'NONE'
type StatusFilter = 'ALL' | MemberStatus

interface MemberCustomer extends Customer {
  createdAt: string
  currentMembership?: Membership | null
  latestMembership?: Membership | null
  membershipStatus: MemberStatus
}

export default function TestingPage() {
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')

  const membersUrl = useMemo(() => {
    const params = new URLSearchParams({ type: 'MEMBER', includeMembershipStatus: 'true', limit: '100' })
    if (searchQuery.trim()) params.set('search', searchQuery.trim())
    return `/api/customers?${params}`
  }, [searchQuery])

  const { data: memberData, isLoading: loading } = useApi<MemberCustomer[]>(membersUrl, { dedupingInterval: 120_000 })
  const { data: shiftData } = useApi<Shift | null>('/api/shifts?current=true', { dedupingInterval: 30_000 })

  const members: MemberCustomer[] = useMemo(() => memberData?.data ?? [], [memberData?.data])
  const shift = shiftData?.data ?? null
  const error = !memberData?.success ? (memberData?.error as string ?? '') : ''

  const filteredMembers = useMemo(
    () => statusFilter === 'ALL'
      ? members
      : members.filter((m) => m.membershipStatus === statusFilter),
    [members, statusFilter]
  )

  const stats = useMemo(() => ({
    total: members.length,
    active: members.filter((m) => m.membershipStatus === 'ACTIVE').length,
    expired: members.filter((m) => m.membershipStatus === 'EXPIRED').length,
    none: members.filter((m) => m.membershipStatus === 'NONE').length,
  }), [members])

  const columns: Column<MemberCustomer>[] = useMemo(() => [
    {
      key: 'fullName',
      label: 'Tên hội viên',
      render: (item) => (
        <span className="flex items-center gap-2 text-base font-semibold text-zinc-950 dark:text-white">
          {item.fullName}
          <StatusBadge status={item.membershipStatus} />
        </span>
      ),
    },
    {
      key: 'phone',
      label: 'SĐT',
      render: (item) => item.phone || '—',
    },
    {
      key: 'createdAt',
      label: 'Đăng ký',
      render: (item) => formatDay(item.createdAt),
    },
    {
      label: '',
      render: (item) => (
        <Button
          variant="inverse"
          size="sm"
          disabled={!shift}
        >
          {item.membershipStatus === 'ACTIVE' ? 'Đóng tiếp' : 'Gia hạn'}
        </Button>
      ),
    },
  ], [shift])

  const renderActionFooter = useMemo(() => {
    function MemberActionFooter(item: MemberCustomer) {
      const statusText = item.membershipStatus === 'ACTIVE' && item.currentMembership
        ? formatDay(item.currentMembership.expiresAt)
        : item.membershipStatus === 'EXPIRED' && item.latestMembership
          ? formatDay(item.latestMembership.expiresAt)
          : 'Chưa đóng phí'

      return (
        <div className="flex flex-col items-end gap-0.5">
          <span className="text-[11px] text-zinc-500 dark:text-zinc-400">{statusText}</span>
          <span className="text-xs font-semibold tabular-nums text-blue-600 dark:text-blue-400">
            {money(item.totalSpent)}
          </span>
        </div>
      )
    }
    return MemberActionFooter
  }, [])

  if (loading) {
    return <TestingSkeleton />
  }

  return (
    <div className="min-h-full bg-zinc-50 px-4 py-4 dark:bg-zinc-950 md:px-6 md:py-6">
      <div className="mx-auto max-w-2xl space-y-4">
        <header>
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Giao diện thử nghiệm
          </p>
          <h1 className="mt-1 text-2xl font-bold text-zinc-950 dark:text-white">
            Testing
          </h1>
        </header>

        {error && (
          <NoticeCard
            tone="danger"
            title="Không tải được dữ liệu"
            description={error}
          />
        )}

        <section className="grid grid-cols-4 gap-2">
          <FilterChip label="Tất cả" count={stats.total} active={statusFilter === 'ALL'} onClick={() => setStatusFilter('ALL')} />
          <FilterChip label="Còn hạn" count={stats.active} active={statusFilter === 'ACTIVE'} onClick={() => setStatusFilter('ACTIVE')} />
          <FilterChip label="Hết hạn" count={stats.expired} active={statusFilter === 'EXPIRED'} onClick={() => setStatusFilter('EXPIRED')} />
          <FilterChip label="Chưa đóng" count={stats.none} active={statusFilter === 'NONE'} onClick={() => setStatusFilter('NONE')} />
        </section>

        <SortableCardList
          columns={columns}
          data={filteredMembers}
          keyExtractor={(m) => m.id}
          sortableKeys={['fullName', 'phone', 'createdAt']}
          defaultSortKey="fullName"
          emptyIcon={UserPlus}
          emptyMessage="Không có hội viên"
          emptyDescription="Thử đổi bộ lọc hoặc đăng ký hội viên mới."
          renderActionFooter={renderActionFooter}
          header={
            <div className="flex items-center justify-between gap-3 border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
              <div>
                <h2 className="text-sm font-semibold text-zinc-950 dark:text-white">Danh sách hội viên</h2>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">{filteredMembers.length} người</p>
              </div>
              <div className="flex gap-2">
                <div className="relative">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <Input
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); setSearchQuery(searchInput) }
                    }}
                    className="pl-9"
                    placeholder="Tìm tên hoặc SĐT"
                  />
                </div>
                <Button variant="secondary" size="sm" onClick={() => setSearchQuery(searchInput)}>
                  Tìm
                </Button>
              </div>
            </div>
          }
        />
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: MemberStatus }) {
  if (status === 'ACTIVE') return <Badge variant="success" size="sm">Còn hạn</Badge>
  if (status === 'EXPIRED') return <Badge variant="warning" size="sm">Hết hạn</Badge>
  return <Badge variant="danger" size="sm">Chưa đóng</Badge>
}

function FilterChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string
  count: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border p-3 text-left shadow-sm transition-colors ${
        active
          ? 'border-blue-300 bg-blue-50 dark:border-blue-500/30 dark:bg-blue-500/10'
          : 'border-zinc-200 bg-white hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800'
      }`}
    >
      <p className="text-[11px] text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums text-zinc-950 dark:text-white">{count}</p>
    </button>
  )
}

function TestingSkeleton() {
  return (
    <div className="space-y-4 p-4 md:p-6">
      <Skeleton className="h-9 w-32" />
      <div className="grid grid-cols-4 gap-2">
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </div>
      <Skeleton className="h-72 w-full" />
    </div>
  )
}
