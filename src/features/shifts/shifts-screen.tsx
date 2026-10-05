'use client'

/**
 * ── DIRECTION CONTRACT — Ca làm (màn /shifts) ──────────────────────────────
 * THESIS: Màn này là SỔ ĐỐI SOÁT, không phải danh sách ca có nhồi số. Mỗi ca
 *   đọc một dòng: ai trực — đã thu bao nhiêu — và cột phải cố định chỉ in KẾT
 *   LUẬN (Khớp / Lệch / Chưa đếm); hai vế DỰ KIẾN · THỰC ĐẾM thuộc màn Giao dịch
 *   trong ca, một tầng sâu hơn. Từ chối: card + rail màu 4px, hai vế tiền lặp
 *   lại ở mọi dòng, và con số tổng cỡ Display (cả màn là một sổ, số phải so
 *   được ở cùng một cỡ).
 * OWN-WORLD: Ink & Gold Ledger — token trong src/app/globals.css; nhãn in hoa
 *   10px cho cột ĐỐI SOÁT, số 14px tabular-nums; khớp = text-success im, thiếu =
 *   danger + dấu '-', thừa = warning; phẳng, hairline 1px, không bóng mới.
 * STORY: Quản lý quét cột ĐỐI SOÁT để biết ca nào lệch, đọc dòng phụ để biết ca
 *   đó đã thu bao nhiêu, rồi mở thẳng sang sổ giao dịch của ca để xem hai vế.
 * FIRST VIEWPORT (mobile 390px): tra cứu + chip lọc; dải HÔM NAY (kết luận ngày)
 *   rồi các ca trong ngày; mỗi ca: badge + giờ + người + dòng Thu · tiền mặt ·
 *   giao dịch · phiên, kết luận nằm ở rail phải; phân trang ở chân danh sách.
 * FORM: code-led (không sinh comp). Chọn #2/7 theo thứ tự cộng hưởng; seed key
 *   adbfafc0 (dealt 4·5·2).
 * FINISH: unreviewed and undocumented is unfinished; this build ends with the
 *   finish review, the verdict, and DESIGN.md.
 * ──────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, History, Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { FilterButton } from '@/components/ui/filter-button'
import { Input, Label } from '@/components/ui/input'
import { NoticeCard } from '@/components/ui/notice-card'
import { AppSkeleton } from '@/components/ui/skeleton'
import { PAGE_TITLE_CLASS } from '@/components/ui/page-title'
import { usePageRefresh } from '@/components/layout/page-refresh-context'
import { money } from '@/features/pos/format'
import { today } from '@/lib/shared/utils'
import { BALANCE_LABEL_CLASS, VerdictMark } from './balance-grid'
import {
  dayLabel,
  dayLedger,
  formatShiftDuration,
  participantNote,
  shiftLedger,
  shiftTimeRange,
} from './shift-ledger'

type ShiftStatusFilter = 'ALL' | 'OPEN' | 'CLOSED'

interface ShiftParticipantRow {
  id: string
  leftAt?: string | null
  staff: { id: string; fullName: string }
}

interface ShiftRevenue {
  totalRevenue: number
  cashRevenue: number
  paymentCount: number
  membershipCount: number
}

interface ShiftRow {
  id: string
  staffId: string
  staff?: { id: string; fullName: string }
  openedAt: string
  closedAt?: string | null
  openingCash?: number | string | null
  closingCash?: number | string | null
  expectedCash?: number | string | null
  cashDifference?: number | string | null
  status: 'OPEN' | 'CLOSED'
  revenue?: ShiftRevenue | null
  participants?: ShiftParticipantRow[]
  _count?: { sessions: number; payments: number }
}

interface DayGroup {
  date: string
  totalRevenue: number
  cashRevenue: number
  paymentCount: number
  membershipCount: number
  sessionCount: number
  shifts: ShiftRow[]
}

interface DayGroupsResponse {
  success: boolean
  data?: DayGroup[]
  pagination?: {
    page: number
    daysPerPage: number
    totalDays: number
    totalPages: number
  }
  error?: string
}

export function ShiftsScreen() {
  const [dayGroups, setDayGroups] = useState<DayGroup[]>([])
  const [pagination, setPagination] = useState({
    page: 1,
    daysPerPage: 7,
    totalDays: 0,
    totalPages: 0,
  })
  const [statusFilter, setStatusFilter] = useState<ShiftStatusFilter>('ALL')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedDate, setSelectedDate] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const todayStr = today()

  const loadData = useCallback(
    async (page: number) => {
      setLoading(true)
      setError('')
      try {
        const params = new URLSearchParams({
          groupBy: 'day',
          daysPerPage: '7',
          page: String(page),
        })
        if (statusFilter !== 'ALL') params.set('status', statusFilter)
        if (selectedDate) {
          params.set('from', selectedDate)
          params.set('to', selectedDate)
        }

        const response = await fetch(`/api/shifts?${params.toString()}`)
        const shiftData = (await response.json()) as DayGroupsResponse

        if (!shiftData.success)
          throw new Error(shiftData.error || 'Không tải được ca làm')

        setDayGroups(shiftData.data ?? [])
        if (shiftData.pagination) setPagination(shiftData.pagination)
      } catch (err) {
        setError((err as Error).message || 'Lỗi kết nối máy chủ')
      } finally {
        setLoading(false)
      }
    },
    [statusFilter, selectedDate],
  )

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadData(1)
  }, [loadData])

  const { registerRefresh } = usePageRefresh()

  useEffect(() => {
    return registerRefresh(() => void loadData(pagination.page))
  }, [registerRefresh, loadData, pagination.page])

  const visibleGroups = useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase()
    if (!keyword) return dayGroups

    return dayGroups
      .map((group) => ({
        ...group,
        shifts: group.shifts.filter((shift) => {
          const names = [
            shift.staff?.fullName,
            ...(shift.participants ?? []).map((p) => p.staff.fullName),
          ]
          return (
            names.some((name) => name?.toLowerCase().includes(keyword)) ||
            shift.id.toLowerCase().includes(keyword)
          )
        }),
      }))
      .filter((group) => group.shifts.length > 0)
  }, [searchQuery, dayGroups])

  const hasFilter = statusFilter !== 'ALL' || searchQuery.trim() !== '' || selectedDate !== ''
  const clearFilters = () => {
    setStatusFilter('ALL')
    setSearchQuery('')
    setSelectedDate('')
  }

  if (loading) return <AppSkeleton />

  return (
    <div className="min-h-full bg-surface-secondary px-4 py-4 md:px-6 md:py-6">
      <div className="mx-auto max-w-content space-y-4">
        <header className="hidden md:block">
          <h1 className={PAGE_TITLE_CLASS}>Ca làm</h1>
          <p className="mt-0.5 text-xs text-text-tertiary">
            Sổ đối soát tiền mặt theo ca
            {pagination.totalDays > 0 && (
              <span className="tabular-nums"> · {pagination.totalDays} ngày</span>
            )}
          </p>
        </header>

        {error && (
          <NoticeCard
            tone="danger"
            title="Không tải được dữ liệu"
            description={error}
            action={
              <Button
                variant="white"
                size="sm"
                onClick={() => void loadData(pagination.page)}
              >
                Thử lại
              </Button>
            }
          />
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative sm:max-w-xs sm:flex-1">
            <Search
              size={14}
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-text-tertiary"
            />
            <Input
              type="search"
              aria-label="Tìm ca làm"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Tìm theo tên nhân viên hoặc mã ca"
              className="pl-8"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            <FilterButton
              active={statusFilter === 'ALL'}
              onClick={() => setStatusFilter('ALL')}
            >
              Tất cả
            </FilterButton>
            <FilterButton
              active={statusFilter === 'OPEN'}
              onClick={() => setStatusFilter('OPEN')}
            >
              Đang mở
            </FilterButton>
            <FilterButton
              active={statusFilter === 'CLOSED'}
              onClick={() => setStatusFilter('CLOSED')}
            >
              Đã đóng
            </FilterButton>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-0 flex-1 sm:max-w-xs">
            <Label htmlFor="shift-date">Ngày mở ca</Label>
            <Input
              id="shift-date"
              type="date"
              value={selectedDate}
              max={todayStr}
              onChange={(event) => setSelectedDate(event.target.value)}
            />
          </div>
          {selectedDate && (
            <Button variant="white" size="lg" onClick={() => setSelectedDate('')}>
              Xoá lọc ngày
            </Button>
          )}
        </div>

        {visibleGroups.length === 0 ? (
          <div className="overflow-hidden rounded-xl border border-border-default bg-surface-elevated shadow-sm">
            {hasFilter ? (
              <EmptyState
                icon={Search}
                message="Không tìm thấy ca phù hợp"
                description="Thử đổi bộ lọc hoặc xoá nội dung tìm kiếm."
                action={
                  <Button variant="white" size="sm" onClick={clearFilters}>
                    Xoá bộ lọc
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={History}
                message="Chưa có ca làm"
                description="Mở ca ở màn Ca hôm nay để bắt đầu ghi nhận lịch sử."
              />
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {visibleGroups.map((group) => (
              <LedgerSection
                key={group.date}
                group={group}
                isToday={group.date === todayStr}
              />
            ))}
          </div>
        )}

        {pagination.totalPages > 1 && (
          <nav
            aria-label="Phân trang ca làm"
            className="flex items-center justify-between gap-3 pt-1"
          >
            <Button
              variant="white"
              size="lg"
              icon={ArrowLeft}
              disabled={pagination.page <= 1 || loading}
              onClick={() => void loadData(pagination.page - 1)}
            >
              Trước
            </Button>
            <span className="text-xs tabular-nums text-text-tertiary">
              Trang {pagination.page}/{pagination.totalPages}
            </span>
            <Button
              variant="white"
              size="lg"
              icon={ArrowRight}
              disabled={pagination.page >= pagination.totalPages || loading}
              onClick={() => void loadData(pagination.page + 1)}
            >
              Sau
            </Button>
          </nav>
        )}
      </div>
    </div>
  )
}

// ─── Một ngày của sổ: kết luận ngày + các ca trong ngày ─────────────────────
function LedgerSection({ group, isToday }: { group: DayGroup; isToday: boolean }) {
  const day = dayLedger(group.shifts)
  const payments = group.paymentCount + group.membershipCount
  // Ngày chỉ có một ca thì dòng tổng lặp y hệt ca đó — chỉ in tổng khi ngày có
  // từ hai ca trở lên (lúc đó con số của dải mới là thông tin mới).
  const hasSummary = group.shifts.length > 1

  return (
    <section className="overflow-hidden rounded-xl border border-border-default bg-surface-elevated shadow-sm">
      <header className="border-b border-border-default bg-surface-tertiary px-4 py-3">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3">
          <div className="flex min-w-0 items-center gap-2">
            {isToday && (
              <Badge variant="purple" size="sm">
                Hôm nay
              </Badge>
            )}
            <h2 className="min-w-0 truncate text-sm font-semibold text-text-primary">
              {dayLabel(group.date)}
            </h2>
            <span className="shrink-0 text-xs tabular-nums text-text-secondary">
              · {group.shifts.length} ca
            </span>
          </div>
          {hasSummary && (
            <div className="text-right">
              <p className={BALANCE_LABEL_CLASS}>Đối soát</p>
              <div className="mt-0.5 flex justify-end">
                <VerdictMark verdict={day.verdict} difference={day.difference} />
              </div>
            </div>
          )}
        </div>
        {hasSummary && (
          <p className="mt-2 text-xs tabular-nums text-text-secondary">
            Thu {money(group.totalRevenue)} · tiền mặt {money(group.cashRevenue)} ·{' '}
            {group.sessionCount} phiên · {payments} giao dịch
            {day.unsettledCount > 0 && ` · ${day.unsettledCount} ca chưa đếm`}
          </p>
        )}
      </header>

      <ul className="divide-y divide-border-default">
        {group.shifts.map((shift) => (
          <li key={shift.id}>
            <ShiftEntry shift={shift} />
          </li>
        ))}
      </ul>
    </section>
  )
}

// ─── Một ca: một dòng sổ + kết luận đối soát ở rail phải ───────────────────
function ShiftEntry({ shift }: { shift: ShiftRow }) {
  const ledger = shiftLedger(shift)
  const revenue = shift.revenue
  const payments = (revenue?.paymentCount ?? 0) + (revenue?.membershipCount ?? 0)
  const sessions = shift._count?.sessions ?? 0
  const hasBusiness =
    (revenue?.totalRevenue ?? 0) > 0 || payments > 0 || sessions > 0
  const participants = participantNote(shift.participants ?? [], shift.staff?.id)
  const duration = shift.closedAt
    ? formatShiftDuration(shift.openedAt, shift.closedAt)
    : null

  return (
    <Link
      href={`/transactions?shiftId=${shift.id}`}
      className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 px-4 py-3 transition-colors hover:bg-surface-tertiary focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-inset focus-visible:outline-none"
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Badge variant={shift.status === 'OPEN' ? 'success' : 'default'} size="sm">
            {shift.status === 'OPEN' ? 'Đang mở' : 'Đã đóng'}
          </Badge>
          <span className="text-sm font-semibold tabular-nums text-text-primary">
            {shiftTimeRange(shift.openedAt, shift.closedAt)}
          </span>
          {duration && <span className="text-xs text-text-tertiary">· {duration}</span>}
        </div>
        <p className="mt-1 truncate text-xs text-text-tertiary">
          Mở bởi{' '}
          <span className="font-medium text-text-secondary">
            {shift.staff?.fullName ?? 'Không rõ'}
          </span>
        </p>
        {participants && (
          <p className="mt-0.5 truncate text-xs text-text-tertiary">{participants}</p>
        )}
        {hasBusiness && (
          <p className="mt-1 text-xs tabular-nums text-text-tertiary">
            Thu {money(revenue?.totalRevenue)} · tiền mặt {money(revenue?.cashRevenue)}
            {sessions > 0 && ` · ${sessions} phiên`}
            {payments > 0 && ` · ${payments} giao dịch`}
          </p>
        )}
      </div>

      <div className="mt-0.5">
        <VerdictMark
          verdict={ledger.verdict}
          difference={ledger.difference}
        />
      </div>
    </Link>
  )
}
