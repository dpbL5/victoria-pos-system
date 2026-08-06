'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Clock,
  LogIn,
  Minus,
  Package,
  Plus,
  ReceiptText,
  RefreshCw,
  Search,
  ShieldCheck,
  Timer,
  UserPlus,
  Users,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Input, Label, Select, Textarea } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { NoticeCard } from '@/components/ui/notice-card'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/components/ui/toast'
import { apiJson, jsonRequest } from './api'
import {
  calcCurrentPlayCost,
  calcElapsedHMS,
  formatClock,
  formatDay,
  money,
  paymentMethodLabel,
  toNumber,
} from './format'
import type { PlayTimeQuote, PromotionSnapshot } from '@/types'
import type {
  Customer,
  Membership,
  MembershipPlan,
  PaymentMethod,
  Product,
  SessionRow,
  Shift,
} from './types'

type CheckInMode = 'WALK_IN' | 'MEMBER'

interface PricingRuleOption {
  id: string
  name: string
  ratePerHour: number
  tiers: { minHours: number; ratePerHour: number }[]
}

interface CheckoutResponse {
  grandTotal: number
}

export function TodayShiftScreen() {
  const router = useRouter()
  const { success: notifySuccess, error: notifyError } = useToast()

  const [shift, setShift] = useState<Shift | null>(null)
  const [openOperationalShift, setOpenOperationalShift] = useState<Shift | null>(null)
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [membershipPlans, setMembershipPlans] = useState<MembershipPlan[]>([])
  const [pricingCount, setPricingCount] = useState<number | null>(null)
  const [activePricingCount, setActivePricingCount] = useState<number | null>(null)
  const [authUserId, setAuthUserId] = useState<string | null>(null)
  const [authRole, setAuthRole] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const [openShiftDialog, setOpenShiftDialog] = useState(false)
  const [closeShiftDialog, setCloseShiftDialog] = useState(false)
  const [checkInDialog, setCheckInDialog] = useState(false)
  const [checkInInitialMode, setCheckInInitialMode] = useState<CheckInMode>('WALK_IN')
  const [checkoutSession, setCheckoutSession] = useState<SessionRow | null>(null)
  const [sellSession, setSellSession] = useState<SessionRow | null>(null)
  const [sellPickOpen, setSellPickOpen] = useState(false)
  const [tools, setTools] = useState<{ id: string; name: string; quantity: number; isRequired: boolean }[]>([])

  const [, setTick] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => setTick((value) => value + 1), 1000)
    return () => window.clearInterval(id)
  }, [])

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [shiftData, openShiftData, sessionData, productData, planData, pricingData, authData, toolsData] = await Promise.all([
        apiJson<Shift | null>('/api/shifts?current=true'),
        apiJson<Shift | null>('/api/shifts?openOperational=true'),
        apiJson<SessionRow[]>('/api/sessions?status=ACTIVE&limit=50'),
        apiJson<Product[]>('/api/products?isActive=true'),
        apiJson<MembershipPlan[]>('/api/membership-plans'),
        apiJson<{ count: number; activeCount?: number }>('/api/pricing/status'),
        apiJson<{ userId: string; role: string }>('/api/auth/me'),
        apiJson<{ id: string; name: string; quantity: number; isRequired: boolean }[]>('/api/tools'),
      ])

      if (!shiftData.success) throw new Error(shiftData.error || 'Không tải được ca làm')
      if (!openShiftData.success) throw new Error(openShiftData.error || 'Không tải được ca đang mở')
      if (!sessionData.success) throw new Error(sessionData.error || 'Không tải được phiên chơi')
      if (!productData.success) throw new Error(productData.error || 'Không tải được hàng hóa')
      if (!planData.success) throw new Error(planData.error || 'Không tải được gói hội viên')
      if (!pricingData.success) throw new Error(pricingData.error || 'Không tải được bảng giá')
      if (!authData.success) throw new Error(authData.error || 'Không tải được thông tin đăng nhập')

      setShift(shiftData.data ?? null)
      setOpenOperationalShift(openShiftData.data ?? null)
      setSessions(sessionData.data ?? [])
      setProducts(productData.data ?? [])
      setMembershipPlans((planData.data ?? []).filter((plan) => plan.isActive))
      setPricingCount(pricingData.data?.count ?? 0)
      setActivePricingCount(pricingData.data?.activeCount ?? pricingData.data?.count ?? 0)
      setAuthUserId(authData.data?.userId ?? null)
      setAuthRole(authData.data?.role ?? null)
      setTools(toolsData.data ?? [])
    } catch (err) {
      setError((err as Error).message || 'Lỗi kết nối máy chủ')
    } finally {
      setLoading(false)
    }
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadData() }, [loadData])

  const activeWalkIns = sessions.filter((session) => session.customer.type === 'WALK_IN').length
  const activeMembers = sessions.filter((session) => session.customer.type === 'MEMBER').length
  const pricingReady = (activePricingCount ?? pricingCount ?? 0) > 0
  const isAdmin = authRole === 'ADMIN'
  const shiftReady = isAdmin || !!shift
  const canJoinCurrentShift = isAdmin && !!authUserId && !!shift && shift.status === 'OPEN'
    && !shift.participants?.some((participant) => (
      !participant.leftAt && participant.staff.id === authUserId
    ))

  const handleOpenShift = async (openingCash?: number, notes?: string, toolCounts?: { toolId: string; openCount: number }[]) => {
    setSubmitting(true)
    try {
      const data = await apiJson<Shift>('/api/shifts', jsonRequest({ openingCash, notes, toolCounts }))
      if (!data.success) {
        notifyError(data.error || 'Không mở được ca')
        return
      }
      notifySuccess(data.message || 'Đã mở hoặc tham gia ca')
      setOpenShiftDialog(false)
      await loadData()
    } catch {
      notifyError('Lỗi kết nối máy chủ')
    } finally {
      setSubmitting(false)
    }
  }

  const handleCloseShift = async (closingCash: number, notes?: string, toolCounts?: { toolId: string; openCount: number }[]) => {
    if (!shift) return

    setSubmitting(true)
    try {
      const data = await apiJson<Shift>(
        `/api/shifts/${shift.id}/close`,
        jsonRequest({ closingCash, notes, toolCounts })
      )
      if (!data.success) {
        notifyError(data.error || 'Không đóng được ca')
        return
      }
      notifySuccess('Đã đóng ca')
      setCloseShiftDialog(false)
      await loadData()
    } catch {
      notifyError('Lỗi kết nối máy chủ')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <TodayShiftSkeleton />
  }

  return (
    <div className="min-h-full bg-zinc-50 px-4 py-4 dark:bg-zinc-950 md:px-6 md:py-6">
      <div className="mx-auto flex max-w-5xl flex-col gap-4">
        <header className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Vận hành sân
            </p>
            <h1 className="mt-1 text-2xl font-bold text-zinc-950 dark:text-white">
              Ca hôm nay
            </h1>
          </div>
          <Button
            variant="secondary"
            size="sm"
            icon={RefreshCw}
            onClick={() => void loadData()}
            title="Làm mới"
          />
        </header>

        {error && (
          <NoticeCard
            tone="danger"
            title="Không tải được dữ liệu"
            description={error}
          />
        )}

        <ShiftRail
          shift={shift}
          activeCount={sessions.length}
          walkInCount={activeWalkIns}
          memberCount={activeMembers}
          onOpen={() => setOpenShiftDialog(true)}
          onClose={() => setCloseShiftDialog(true)}
          onViewTransactions={() => {
            if (shift) router.push(`/transactions?shiftId=${shift.id}`)
          }}
          canJoin={canJoinCurrentShift}
          onJoin={() => void handleOpenShift()}
          submitting={submitting}
        />

        {!shiftReady && (
          <div className="fixed inset-0 bottom-16 z-30 flex items-center justify-center bg-black/50 backdrop-blur-sm md:bottom-0">
            <div className="mx-4 flex w-full max-w-sm flex-col items-center rounded-2xl border border-amber-200 bg-white p-6 text-center shadow-xl dark:border-amber-500/20 dark:bg-zinc-900">
              <div className="flex size-12 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-500/20">
                <ShieldCheck size={24} className="text-amber-600 dark:text-amber-400" />
              </div>
              <h3 className="mt-4 text-lg font-bold text-zinc-950 dark:text-white">
                Chưa mở ca
              </h3>
              <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                Cần mở hoặc tham gia ca trước khi check-in, checkout và thu tiền.
              </p>
              <Button
                variant="primary"
                size="md"
                onClick={() => setOpenShiftDialog(true)}
                className="mt-5 w-full"
              >
                Mở / Tham gia ca
              </Button>
            </div>
          </div>
        )}

        <QuickActions
          shiftReady={shiftReady}
          onCheckIn={() => {
            setCheckInInitialMode('WALK_IN')
            setCheckInDialog(true)
          }}
          onSell={() => {
            if (sessions.length === 0) {
              notifyError('Chưa có phiên đang chơi để bán kèm')
              return
            }
            if (sessions.length === 1) {
              setSellSession(sessions[0])
            } else {
              setSellPickOpen(true)
            }
          }}
        />

        <section className="rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
            <div>
              <h2 className="text-sm font-semibold text-zinc-950 dark:text-white">
                Đang chơi
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {sessions.length} phiên đang hoạt động
              </p>
            </div>
          </div>

          {sessions.length === 0 ? (
            <EmptyState
              icon={Timer}
              message="Chưa có phiên đang chơi"
              description={shiftReady ? 'Bắt đầu bằng một lượt check-in.' : 'Mở ca để bắt đầu vận hành.'}
              action={
                <Button variant="primary" disabled={!shiftReady} onClick={() => {
                  setCheckInInitialMode('WALK_IN')
                  setCheckInDialog(true)
                }}>
                  Check-in
                </Button>
              }
            />
          ) : (
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {sessions.map((session) => (
                <ActiveSessionCard
                  key={session.id}
                  session={session}
                  checkoutDisabled={!shiftReady}
                  onCheckout={() => setCheckoutSession(session)}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      <OpenShiftDialog
        open={openShiftDialog}
        existingShift={!shift ? openOperationalShift : null}
        tools={tools}
        submitting={submitting}
        onClose={() => setOpenShiftDialog(false)}
        onSubmit={handleOpenShift}
      />

      <CloseShiftDialog
        open={closeShiftDialog}
        shift={shift}
        tools={tools}
        submitting={submitting}
        onClose={() => setCloseShiftDialog(false)}
        onSubmit={handleCloseShift}
      />

      <CheckInDialog
        open={checkInDialog}
        initialMode={checkInInitialMode}
        pricingReady={pricingReady}
        shiftReady={shiftReady}
        membershipPlans={membershipPlans}
        submitting={submitting}
        setSubmitting={setSubmitting}
        onClose={() => setCheckInDialog(false)}
        onDone={async () => {
          setCheckInDialog(false)
          await loadData()
        }}
      />

      <CheckoutDrawer
        session={checkoutSession}
        products={products}
        shiftReady={shiftReady}
        submitting={submitting}
        setSubmitting={setSubmitting}
        onClose={() => setCheckoutSession(null)}
        onDone={async () => {
          setCheckoutSession(null)
          await loadData()
        }}
      />

      <SellDialog
        session={sellSession}
        products={products}
        shiftReady={shiftReady}
        submitting={submitting}
        setSubmitting={setSubmitting}
        onClose={() => setSellSession(null)}
        onDone={async () => {
          setSellSession(null)
          await loadData()
        }}
      />

      <SellPickDialog
        open={sellPickOpen}
        sessions={sessions}
        onClose={() => setSellPickOpen(false)}
        onSelect={(session) => {
          setSellPickOpen(false)
          setSellSession(session)
        }}
      />

    </div>
  )
}

function TodayShiftSkeleton() {
  return (
    <div className="space-y-4 p-4 md:p-6">
      <Skeleton className="h-10 w-40" />
      <Skeleton className="h-32 w-full" />
      <div className="grid grid-cols-2 gap-2">
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  )
}

function ShiftRail({
  shift,
  activeCount,
  walkInCount,
  memberCount,
  onOpen,
  onClose,
  onViewTransactions,
  canJoin,
  onJoin,
  submitting,
}: {
  shift: Shift | null
  activeCount: number
  walkInCount: number
  memberCount: number
  onOpen: () => void
  onClose: () => void
  onViewTransactions: () => void
  canJoin: boolean
  onJoin: () => void
  submitting: boolean
}) {
  const participantNames = shift?.participants?.map((participant) => participant.staff.fullName) ?? []
  const participantLabel = participantNames.length > 0
    ? `${participantNames.length} nhân viên: ${participantNames.join(', ')}`
    : shift?.staff
      ? `Người mở ca: ${shift.staff.fullName}`
      : ''

  return (
    <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="grid grid-cols-[6px_1fr]">
        <div className={shift ? 'bg-emerald-500' : 'bg-amber-500'} />
        <div className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Clock size={18} className={shift ? 'text-emerald-500' : 'text-amber-500'} />
                <h2 className="text-sm font-semibold text-zinc-950 dark:text-white">
                  {shift ? `Ca mở từ ${formatClock(shift.openedAt)}` : 'Chưa mở ca'}
                </h2>
              </div>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                {shift
                  ? `${formatDay(shift.openedAt)} · Tiền đầu ca ${money(shift.openingCash)}`
                  : 'Mở ca mới hoặc tham gia ca quầy đang mở để vận hành POS.'}
              </p>
              {shift && participantLabel && (
                <p className="mt-2 flex min-w-0 items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                  <Users size={13} className="shrink-0" />
                  <span className="truncate">{participantLabel}</span>
                </p>
              )}
            </div>
            {shift ? (
              <div className="flex items-center gap-2">
                {canJoin && (
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={submitting}
                    onClick={onJoin}
                  >
                    {submitting ? 'Đang tham gia...' : 'Tham gia ca làm'}
                  </Button>
                )}
                <Button variant="secondary" size="sm" onClick={onViewTransactions}>
                  Xem giao dịch
                </Button>
                <Button variant="secondary" size="sm" onClick={onClose}>
                  Đóng ca
                </Button>
              </div>
            ) : (
              <Button variant="primary" size="sm" onClick={onOpen}>
                Mở/Tham gia
              </Button>
            )}
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2">
            <MiniStat label="Đang chơi" value={activeCount} />
            <MiniStat label="Vãng lai" value={walkInCount} />
            <MiniStat label="Hội viên" value={memberCount} />
          </div>
        </div>
      </div>
    </section>
  )
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-zinc-50 px-3 py-2 dark:bg-zinc-950">
      <p className="text-[11px] text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums text-zinc-950 dark:text-white">
        {value}
      </p>
    </div>
  )
}

function QuickActions({
  shiftReady,
  onCheckIn,
  onSell,
}: {
  shiftReady: boolean
  onCheckIn: () => void
  onSell: () => void
}) {
  const actions = [
    { label: 'Check-in', Icon: LogIn, onClick: onCheckIn, tone: 'emerald' },
    { label: 'Bán kèm', Icon: Package, onClick: onSell, tone: 'zinc' },
  ] as const

  return (
    <div className="grid grid-cols-2 gap-2">
      {actions.map(({ label, Icon, onClick, tone }) => (
        <button
          key={label}
          type="button"
          disabled={!shiftReady}
          onClick={onClick}
          className={`flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl border text-sm font-medium shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
            tone === 'emerald'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300'
              : 'border-zinc-200 bg-white text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200'
          }`}
        >
          <Icon size={20} />
          <span>{label}</span>
        </button>
      ))}
    </div>
  )
}

function ActiveSessionCard({
  session,
  checkoutDisabled,
  onCheckout,
}: {
  session: SessionRow
  checkoutDisabled: boolean
  onCheckout: () => void
}) {
  const isMember = session.customer.type === 'MEMBER'
  const playerCount = session.playerCount ?? 1
  const isGroup = playerCount > 1
  const groups = session.pricingGroups ?? []
  const hasGroups = groups.length > 0

  // Calculate total running cost
  const currentCost = isMember
    ? 0
    : hasGroups
      ? groups
          .filter(g => g.remainingCount > 0)
          .reduce((sum, g) => {
            return sum + calcCurrentPlayCost(
              session.startTime,
              g.hourlyRate,
              undefined,
              g.pricingSnapshot?.tiers,
              g.remainingCount,
            )
          }, 0)
      : calcCurrentPlayCost(
          session.startTime,
          session.hourlyRate,
          undefined,
          session.pricingRuleSnapshot?.tiers,
          playerCount,
        )
  const pendingSell = toNumber(session.pendingSellTotal ?? 0)
  const runningTotal = currentCost + pendingSell

  return (
    <div className="grid grid-cols-[1fr_auto] gap-3 px-4 py-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold text-zinc-950 dark:text-white">
            {session.customer.fullName}
          </p>
          <Badge variant={isMember ? 'purple' : 'default'} size="sm">
            {isMember ? 'Hội viên' : 'Vãng lai'}
          </Badge>
          {isGroup && (
            <Badge variant="outline" size="sm">
              {playerCount} người
            </Badge>
          )}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
          <span className="inline-flex items-center gap-1 tabular-nums">
            <Timer size={13} />
            {calcElapsedHMS(session.startTime)}
          </span>
          <span>{formatClock(session.startTime)}</span>
          {session.shift ? <span>Ca {formatClock(session.shift.openedAt)}</span> : <span>Chưa gắn ca</span>}
        </div>
        {!isMember && hasGroups && (
          <div className="mt-2 space-y-1">
            {groups.filter(g => g.remainingCount > 0).map((g) => {
              const groupCost = calcCurrentPlayCost(
                session.startTime,
                g.hourlyRate,
                undefined,
                g.pricingSnapshot?.tiers,
                g.remainingCount,
              )
              return (
                <div key={g.id} className="flex items-center justify-between text-xs">
                  <span className="truncate text-zinc-400 dark:text-zinc-500">
                    {g.label}: {g.remainingCount} người · {g.pricingSnapshot?.name ?? 'Bảng giá'}
                  </span>
                  <span className="shrink-0 tabular-nums text-zinc-600 dark:text-zinc-300">
                    {money(groupCost)}
                  </span>
                </div>
              )
            })}
          </div>
        )}
        {!isMember && !hasGroups && session.pricingRuleSnapshot && (
          <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
            Bảng giá: {session.pricingRuleSnapshot.name} — {money(session.pricingRuleSnapshot.ratePerHour)}/giờ
          </p>
        )}
      </div>
      <div className="flex flex-col items-end justify-between gap-2">
        <div className="text-right">
          <p className="text-sm font-bold tabular-nums text-zinc-950 dark:text-white">
            {money(runningTotal)}
          </p>
          {isGroup && !isMember && !hasGroups && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {money(currentCost / playerCount)}/người
            </p>
          )}
          {pendingSell > 0 && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {!isGroup && !isMember ? `${money(currentCost)} giờ + ` : ''}{money(pendingSell)} thêm
            </p>
          )}
        </div>
        <Button variant="inverse" size="xs" disabled={checkoutDisabled} onClick={onCheckout}>
          Thu
        </Button>
      </div>
    </div>
  )
}

function OpenShiftDialog({
  open,
  existingShift,
  tools,
  submitting,
  onClose,
  onSubmit,
}: {
  open: boolean
  existingShift: Shift | null
  tools: { id: string; name: string; quantity: number; isRequired: boolean }[]
  submitting: boolean
  onClose: () => void
  onSubmit: (openingCash?: number, notes?: string, toolCounts?: { toolId: string; openCount: number }[]) => void
}) {
  const [openingCash, setOpeningCash] = useState('0')
  const [notes, setNotes] = useState('')
  const [toolCounts, setToolCounts] = useState<Record<string, string>>({})
  const isJoiningExistingShift = !!existingShift

  useEffect(() => {
    if (!open) return
    /* eslint-disable react-hooks/set-state-in-effect */
    setOpeningCash('0')
    setNotes('')
    setToolCounts({})
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open, existingShift?.id])

  const handleSubmit = () => {
    if (isJoiningExistingShift) {
      onSubmit()
      return
    }

    const tc = tools
      .map((t) => {
        const val = toolCounts[t.id]
        if (val === undefined || val === '') return null
        return { toolId: t.id, openCount: Number(val) || 0 }
      })
      .filter(Boolean) as { toolId: string; openCount: number }[]

    onSubmit(Number(openingCash || 0), notes.trim() || undefined, tc.length > 0 ? tc : undefined)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isJoiningExistingShift ? 'Tham gia ca đang mở' : 'Mở ca'}
      description={
        isJoiningExistingShift
          ? 'Ca quầy đã được mở, bạn chỉ cần tham gia để vận hành POS.'
          : 'Nhập tiền mặt đầu ca để bắt đầu ca quầy.'
      }
      footer={
        <Button
          variant="primary"
          size="lg"
          fullWidth
          disabled={submitting}
          onClick={handleSubmit}
        >
          {submitting
            ? 'Đang xử lý...'
            : isJoiningExistingShift
              ? 'Tham gia ca'
              : 'Mở ca'}
        </Button>
      }
    >
      <div className="space-y-3">
        {isJoiningExistingShift ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-500/20 dark:bg-emerald-500/10">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                  Ca đang mở từ {formatClock(existingShift.openedAt)}
                </p>
                <p className="mt-1 text-xs text-emerald-700/80 dark:text-emerald-300/80">
                  Người mở ca: {existingShift.staff?.fullName ?? 'Không rõ'} · Tiền đầu ca {money(existingShift.openingCash)}
                </p>
              </div>
              <Badge variant="success">Đang mở</Badge>
            </div>
          </div>
        ) : (
          <>
            <div>
              <Label htmlFor="opening-cash">Tiền mặt đầu ca</Label>
              <Input
                id="opening-cash"
                type="number"
                min={0}
                value={openingCash}
                onChange={(event) => setOpeningCash(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="opening-notes">Ghi chú</Label>
              <Textarea
                id="opening-notes"
                rows={3}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </div>
            <ToolCountFields
              tools={tools}
              values={toolCounts}
              onChange={setToolCounts}
            />
          </>
        )}
      </div>
    </Modal>
  )
}

function CloseShiftDialog({
  open,
  shift,
  tools,
  submitting,
  onClose,
  onSubmit,
}: {
  open: boolean
  shift: Shift | null
  tools: { id: string; name: string; quantity: number; isRequired: boolean }[]
  submitting: boolean
  onClose: () => void
  onSubmit: (closingCash: number, notes?: string, toolCounts?: { toolId: string; openCount: number }[]) => void
}) {
  const [closingCash, setClosingCash] = useState('')
  const [notes, setNotes] = useState('')
  const [toolCounts, setToolCounts] = useState<Record<string, string>>({})

  useEffect(() => {
    if (open && shift) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setClosingCash(String(toNumber(shift.openingCash)))
    }
  }, [open, shift])

  useEffect(() => {
    if (!open) {
      setToolCounts({})
    }
  }, [open])

  const handleSubmit = () => {
    const tc = tools
      .map((t) => {
        const val = toolCounts[t.id]
        if (val === undefined || val === '') return null
        return { toolId: t.id, openCount: Number(val) || 0 }
      })
      .filter(Boolean) as { toolId: string; openCount: number }[]

    onSubmit(Number(closingCash), notes.trim() || undefined, tc.length > 0 ? tc : undefined)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Đóng ca"
      description={shift ? `Ca mở từ ${formatClock(shift.openedAt)}` : undefined}
      footer={
        <Button
          variant="inverse"
          size="lg"
          fullWidth
          disabled={submitting || !closingCash}
          onClick={handleSubmit}
        >
          {submitting ? 'Đang đóng ca...' : 'Đóng ca'}
        </Button>
      }
    >
      <div className="space-y-3">
        <div className="rounded-lg bg-zinc-50 p-3 text-sm dark:bg-zinc-950">
          <div className="flex justify-between">
            <span className="text-zinc-500 dark:text-zinc-400">Tiền đầu ca</span>
            <span className="font-medium text-zinc-950 dark:text-white">{money(shift?.openingCash)}</span>
          </div>
        </div>
        <div>
          <Label htmlFor="closing-cash" required>Tiền mặt thực đếm</Label>
          <Input
            id="closing-cash"
            type="number"
            min={0}
            value={closingCash}
            onChange={(event) => setClosingCash(event.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="closing-notes">Ghi chú cuối ca</Label>
          <Textarea
            id="closing-notes"
            rows={3}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </div>
        <ToolCountFields
          tools={tools}
          values={toolCounts}
          onChange={setToolCounts}
        />
      </div>
    </Modal>
  )
}

function GroupBuilder({
  totalPlayers,
  groups,
  onChange,
  applicablePricingRules,
}: {
  totalPlayers: number
  groups: Array<{ playerCount: number; pricingRuleId: string }>
  onChange: (groups: Array<{ playerCount: number; pricingRuleId: string }>) => void
  applicablePricingRules: PricingRuleOption[]
}) {
  const usedCount = groups.reduce((s, g) => s + g.playerCount, 0)
  const remaining = totalPlayers - usedCount

  const addGroup = () => {
    if (remaining <= 0) return
    const defaultRule = applicablePricingRules[0]
    onChange([...groups, { playerCount: Math.min(1, remaining), pricingRuleId: defaultRule?.id ?? '' }])
  }

  const updateGroup = (index: number, field: 'playerCount' | 'pricingRuleId', value: number | string) => {
    const updated = [...groups]
    updated[index] = { ...updated[index], [field]: value }
    onChange(updated)
  }

  const removeGroup = (index: number) => {
    onChange(groups.filter((_, i) => i !== index))
  }

  const groupRemaining = (index: number) => {
    const prevSum = groups.slice(0, index).reduce((s, g) => s + g.playerCount, 0)
    const otherSum = groups.slice(index + 1).reduce((s, g) => s + g.playerCount, 0)
    return totalPlayers - prevSum - otherSum
  }

  if (applicablePricingRules.length === 0) return null

  return (
    <div className="mt-3 space-y-3">
      <Label>Phân chia bảng giá</Label>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        {usedCount}/{totalPlayers} người đã phân — còn {remaining} người
      </p>
      {groups.map((group, i) => (
        <div key={i} className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-zinc-950 dark:text-white">Nhóm {i + 1}</span>
            {groups.length > 1 && (
              <button type="button" onClick={() => removeGroup(i)} className="text-xs text-red-500 dark:text-red-300">
                Xoá
              </button>
            )}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Số người</Label>
              <div className="mt-1 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => updateGroup(i, 'playerCount', Math.max(1, group.playerCount - 1))}
                  disabled={group.playerCount <= 1}
                  className="flex h-8 w-8 items-center justify-center rounded border border-zinc-200 text-zinc-600 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300"
                >
                  <Minus size={14} />
                </button>
                <span className="w-8 text-center text-sm font-semibold tabular-nums text-zinc-950 dark:text-white">
                  {group.playerCount}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const maxAdd = remaining + group.playerCount
                    updateGroup(i, 'playerCount', Math.min(maxAdd, group.playerCount + 1))
                  }}
                  disabled={group.playerCount >= (groupRemaining(i) + remaining)}
                  className="flex h-8 w-8 items-center justify-center rounded bg-zinc-950 text-white disabled:opacity-40 dark:bg-white dark:text-zinc-950"
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>
            <div>
              <Label className="text-xs">Bảng giá</Label>
              <Select
                value={group.pricingRuleId}
                onChange={(e) => updateGroup(i, 'pricingRuleId', e.target.value)}
              >
                {applicablePricingRules.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} — {money(r.ratePerHour)}/giờ
                  </option>
                ))}
              </Select>
            </div>
          </div>
        </div>
      ))}
      {remaining > 0 && (
        <button
          type="button"
          onClick={addGroup}
          className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-300"
        >
          <Plus size={14} />
          Thêm nhóm ({remaining} người chưa phân)
        </button>
      )}
    </div>
  )
}

function CheckInDialog({
  open,
  initialMode,
  pricingReady,
  shiftReady,
  membershipPlans,
  submitting,
  setSubmitting,
  onClose,
  onDone,
}: {
  open: boolean
  initialMode: CheckInMode
  pricingReady: boolean
  shiftReady: boolean
  membershipPlans: MembershipPlan[]
  submitting: boolean
  setSubmitting: (value: boolean) => void
  onClose: () => void
  onDone: () => Promise<void>
}) {
  const { success: notifySuccess, error: notifyError } = useToast()
  const [mode, setMode] = useState<CheckInMode>('WALK_IN')
  const [walkInName, setWalkInName] = useState('')
  const [playerCount, setPlayerCount] = useState(1)
  const [memberSearch, setMemberSearch] = useState('')
  const [memberResults, setMemberResults] = useState<Customer[]>([])
  const [selectedMember, setSelectedMember] = useState<Customer | null>(null)
  const [currentMembership, setCurrentMembership] = useState<Membership | null>(null)
  const [membershipActive, setMembershipActive] = useState(false)
  const [memberLoading, setMemberLoading] = useState(false)
  const [newMember, setNewMember] = useState(false)
  const [newMemberName, setNewMemberName] = useState('')
  const [newMemberPhone, setNewMemberPhone] = useState('')
  const [planId, setPlanId] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH')
  const [applicablePricingRules, setApplicablePricingRules] = useState<PricingRuleOption[]>([])
  const [selectedPricingRuleId, setSelectedPricingRuleId] = useState('')
  const [pricingRulesLoading, setPricingRulesLoading] = useState(false)
  const [pricingGroups, setPricingGroups] = useState<Array<{ playerCount: number; pricingRuleId: string }>>([])

  useEffect(() => {
    if (!open) return
    /* eslint-disable react-hooks/set-state-in-effect */
    setMode(initialMode)
    setWalkInName('')
    setPlayerCount(1)
    setMemberSearch('')
    setMemberResults([])
    setSelectedMember(null)
    setCurrentMembership(null)
    setMembershipActive(false)
    setNewMember(false)
    setNewMemberName('')
    setNewMemberPhone('')
    setPlanId(membershipPlans[0]?.id ?? '')
    setPaymentMethod('CASH')
    setApplicablePricingRules([])
    setSelectedPricingRuleId('')
    setPricingGroups([])
    /* eslint-enable react-hooks/set-state-in-effect */

    // Fetch applicable pricing rules cho WALK_IN mode
    setPricingRulesLoading(true)
    apiJson<PricingRuleOption[]>('/api/pricing/applicable')
      .then((data) => {
        if (data.success) {
          const rules = data.data ?? []
          setApplicablePricingRules(rules)
          if (rules.length > 0) {
            setSelectedPricingRuleId(rules[0].id)
          }
        }
      })
      .catch(() => { /* bỏ qua lỗi, pricing rules optional */ })
      .finally(() => setPricingRulesLoading(false))
  }, [open, initialMode, membershipPlans])

  const searchMembers = async () => {
    const q = memberSearch.trim()
    if (!q) return

    setMemberLoading(true)
    setSelectedMember(null)
    setCurrentMembership(null)
    setMembershipActive(false)
    try {
      const data = await apiJson<Customer[]>(
        `/api/customers?type=MEMBER&search=${encodeURIComponent(q)}&limit=8`
      )
      if (!data.success) {
        notifyError(data.error || 'Không tìm được hội viên')
        return
      }
      setMemberResults(data.data ?? [])
    } catch {
      notifyError('Lỗi kết nối máy chủ')
    } finally {
      setMemberLoading(false)
    }
  }

  const loadMembership = async (customer: Customer) => {
    setSelectedMember(customer)
    setMemberSearch(customer.fullName)
    setMemberResults([])
    setMemberLoading(true)
    try {
      const data = await apiJson<Membership[]>(`/api/memberships?customerId=${customer.id}`)
      if (!data.success) {
        notifyError(data.error || 'Không tải được trạng thái hội viên')
        return
      }
      setCurrentMembership((data.current as Membership) ?? null)
      setMembershipActive(!!data.current)
    } catch {
      notifyError('Lỗi kết nối máy chủ')
    } finally {
      setMemberLoading(false)
    }
  }

  const createSession = async (customerId: string) => {
    const body: Record<string, unknown> = { customerId }
    if (mode === 'WALK_IN') {
      if (playerCount > 1 && pricingGroups.length > 0) {
        body.groups = pricingGroups
      } else if (selectedPricingRuleId) {
        body.pricingRuleId = selectedPricingRuleId
      }
      if (playerCount > 1) {
        body.playerCount = playerCount
      }
    }
    const data = await apiJson<SessionRow>('/api/sessions', jsonRequest(body))
    if (!data.success) {
      notifyError(data.error || 'Không check-in được')
      return false
    }
    return true
  }

  const renewThenCheckIn = async (customerId: string) => {
    if (!planId) {
      notifyError('Chưa có gói hội viên để gia hạn')
      return false
    }

    const renewal = await apiJson('/api/memberships/renew', jsonRequest({
      customerId,
      planId,
      paymentMethod,
    }))
    if (!renewal.success) {
      notifyError(renewal.error || 'Không gia hạn được hội viên')
      return false
    }

    return createSession(customerId)
  }

  const handleConfirm = async () => {
    if (!shiftReady) {
      notifyError('Cần mở ca trước khi check-in')
      return
    }

    if (mode === 'WALK_IN' && !pricingReady) {
      notifyError('Chưa có bảng giá cho khách vãng lai')
      return
    }

    setSubmitting(true)
    try {
      let ok = false

      if (mode === 'WALK_IN') {
        if (!walkInName.trim()) {
          notifyError('Nhập tên khách vãng lai')
          return
        }
        const customer = await apiJson<Customer>('/api/customers', jsonRequest({
          fullName: walkInName.trim(),
          type: 'WALK_IN',
        }))
        if (!customer.success || !customer.data) {
          notifyError(customer.error || 'Không tạo được khách')
          return
        }
        ok = await createSession(customer.data.id)
      } else if (newMember) {
        if (!newMemberName.trim()) {
          notifyError('Nhập tên hội viên')
          return
        }
        if (!planId) {
          notifyError('Chưa có gói hội viên để đăng ký')
          return
        }
        const registration = await apiJson<{ customer: Customer }>('/api/memberships/register', jsonRequest({
          fullName: newMemberName.trim(),
          phone: newMemberPhone.trim(),
          planId,
          paymentMethod,
        }))
        if (!registration.success || !registration.data) {
          notifyError(registration.error || 'Không đăng ký được hội viên')
          return
        }
        ok = await createSession(registration.data.customer.id)
      } else if (selectedMember) {
        ok = membershipActive
          ? await createSession(selectedMember.id)
          : await renewThenCheckIn(selectedMember.id)
      } else {
        notifyError('Chọn hội viên để check-in')
        return
      }

      if (ok) {
        notifySuccess('Check-in thành công')
        await onDone()
      }
    } catch {
      notifyError('Lỗi kết nối máy chủ')
    } finally {
      setSubmitting(false)
    }
  }

  const needsRenewal = mode === 'MEMBER' && (newMember || (selectedMember && !membershipActive))
  const selectedPlan = membershipPlans.find((plan) => plan.id === planId)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Check-in"
      description={mode === 'WALK_IN' ? 'Khách vãng lai tính tiền theo giờ' : 'Hội viên cần còn hạn trước khi chơi'}
      footer={
        <Button
          variant="primary"
          size="lg"
          fullWidth
          disabled={submitting || !shiftReady}
          onClick={handleConfirm}
        >
          {submitting
            ? 'Đang xử lý...'
            : needsRenewal
              ? 'Gia hạn & check-in'
              : 'Check-in'}
        </Button>
      }
      size="lg"
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setMode('WALK_IN')}
            className={`rounded-xl border p-3 text-left ${
              mode === 'WALK_IN'
                ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10'
                : 'border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900'
            }`}
          >
            <Users size={18} className="text-emerald-600" />
            <p className="mt-2 text-sm font-semibold text-zinc-950 dark:text-white">Vãng lai</p>
          </button>
          <button
            type="button"
            onClick={() => setMode('MEMBER')}
            className={`rounded-xl border p-3 text-left ${
              mode === 'MEMBER'
                ? 'border-purple-300 bg-purple-50 dark:border-purple-500/30 dark:bg-purple-500/10'
                : 'border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900'
            }`}
          >
            <ShieldCheck size={18} className="text-purple-600" />
            <p className="mt-2 text-sm font-semibold text-zinc-950 dark:text-white">Hội viên</p>
          </button>
        </div>

        {mode === 'WALK_IN' ? (
          <div>
            <Label htmlFor="walk-in-name" required>Tên khách</Label>
            <Input
              id="walk-in-name"
              value={walkInName}
              onChange={(event) => setWalkInName(event.target.value)}
              placeholder="Nhập tên khách"
            />
            <div className="mt-3">
              <Label htmlFor="player-count">Số người chơi</Label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPlayerCount((c) => Math.max(1, c - 1))}
                  disabled={playerCount <= 1}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300"
                >
                  <Minus size={14} />
                </button>
                <span className="w-10 text-center text-sm font-semibold tabular-nums text-zinc-950 dark:text-white">
                  {playerCount}
                </span>
                <button
                  type="button"
                  onClick={() => setPlayerCount((c) => Math.min(50, c + 1))}
                  disabled={playerCount >= 50}
                  className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-950 text-white disabled:opacity-40 dark:bg-white dark:text-zinc-950"
                >
                  <Plus size={14} />
                </button>
              </div>
              {playerCount > 1 && (
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  Nhóm {playerCount} người — chỉ cần 1 người ghi tên, checkout từng người
                </p>
              )}
            </div>
            {playerCount > 1 ? (
              <GroupBuilder
                totalPlayers={playerCount}
                groups={pricingGroups}
                onChange={setPricingGroups}
                applicablePricingRules={applicablePricingRules}
              />
            ) : (
              applicablePricingRules.length > 0 && (
                <div className="mt-3">
                  <Label htmlFor="pricing-rule">Bảng giá áp dụng</Label>
                  <Select
                    id="pricing-rule"
                    value={selectedPricingRuleId}
                    disabled={pricingRulesLoading}
                    onChange={(event) => setSelectedPricingRuleId(event.target.value)}
                  >
                    {applicablePricingRules.map((rule) => (
                      <option key={rule.id} value={rule.id}>
                        {rule.name} — {money(rule.ratePerHour)}/giờ
                        {rule.tiers.length > 0 ? ` (${rule.tiers.length} bậc luỹ tiến)` : ''}
                      </option>
                    ))}
                  </Select>
                  {selectedPricingRuleId && (() => {
                    const selected = applicablePricingRules.find((r) => r.id === selectedPricingRuleId)
                    if (!selected || selected.tiers.length === 0) return null
                    return (
                      <div className="mt-2 rounded-lg bg-zinc-50 p-2 dark:bg-zinc-900">
                        <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Giá luỹ tiến:</p>
                        <div className="mt-1 space-y-0.5">
                          <p className="text-xs text-zinc-600 dark:text-zinc-300">
                            0-{selected.tiers[0].minHours}h: {money(selected.ratePerHour)}/giờ
                          </p>
                          {selected.tiers.map((tier, i) => {
                            const nextMin = selected.tiers[i + 1]?.minHours
                            return (
                              <p key={i} className="text-xs text-zinc-600 dark:text-zinc-300">
                                {tier.minHours}h{nextMin ? `-${nextMin}h` : '+'}: {money(tier.ratePerHour)}/giờ
                              </p>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })()}
                </div>
              )
            )}
            {!pricingReady && (
              <p className="mt-2 text-xs text-amber-600 dark:text-amber-300">
                Cần tạo bảng giá trước khi check-in khách vãng lai.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {!newMember && (
              <>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search
                      size={15}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
                    />
                    <Input
                      value={memberSearch}
                      onChange={(event) => setMemberSearch(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          void searchMembers()
                        }
                      }}
                      className="pl-9"
                      placeholder="Tên hoặc SĐT hội viên"
                    />
                  </div>
                  <Button variant="primary" size="md" disabled={memberLoading} onClick={() => void searchMembers()}>
                    Tìm
                  </Button>
                </div>

                {memberResults.length > 0 && (
                  <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
                    {memberResults.map((customer) => (
                      <button
                        key={customer.id}
                        type="button"
                        onClick={() => void loadMembership(customer)}
                        className="flex w-full items-center justify-between gap-3 border-b border-zinc-100 px-3 py-2.5 text-left last:border-b-0 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800"
                      >
                        <div>
                          <p className="text-sm font-medium text-zinc-950 dark:text-white">
                            {customer.fullName}
                          </p>
                          <p className="text-xs text-zinc-500 dark:text-zinc-400">
                            {customer.phone || 'Chưa có SĐT'}
                          </p>
                        </div>
                        <Badge variant="purple" size="sm">HV</Badge>
                      </button>
                    ))}
                  </div>
                )}

                {selectedMember && (
                  <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-zinc-950 dark:text-white">
                          {selectedMember.fullName}
                        </p>
                        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                          {membershipActive && currentMembership
                            ? `Còn hạn đến ${formatDay(currentMembership.expiresAt)}`
                            : 'Cần gia hạn trước khi chơi'}
                        </p>
                      </div>
                      <Badge variant={membershipActive ? 'success' : 'warning'}>
                        {membershipActive ? 'Còn hạn' : 'Hết hạn'}
                      </Badge>
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setNewMember(true)
                    setSelectedMember(null)
                    setCurrentMembership(null)
                  }}
                  className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-300"
                >
                  <UserPlus size={14} />
                  Tạo hội viên mới
                </button>
              </>
            )}

            {newMember && (
              <div className="space-y-3 rounded-xl border border-blue-200 bg-blue-50 p-3 dark:border-blue-500/20 dark:bg-blue-500/10">
                <div>
                  <Label htmlFor="new-member-name" required>Tên hội viên</Label>
                  <Input
                    id="new-member-name"
                    value={newMemberName}
                    onChange={(event) => setNewMemberName(event.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="new-member-phone">Số điện thoại</Label>
                  <Input
                    id="new-member-phone"
                    value={newMemberPhone}
                    onChange={(event) => setNewMemberPhone(event.target.value)}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setNewMember(false)}
                  className="text-xs font-medium text-zinc-600 dark:text-zinc-300"
                >
                  Quay lại tìm hội viên
                </button>
              </div>
            )}

            {needsRenewal && (
              <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-500/20 dark:bg-amber-500/10">
                <div>
                  <Label htmlFor="membership-plan" required>Gói hội viên</Label>
                  <Select
                    id="membership-plan"
                    value={planId}
                    onChange={(event) => setPlanId(event.target.value)}
                  >
                    {membershipPlans.map((plan) => (
                      <option key={plan.id} value={plan.id}>
                        {plan.name} - {money(plan.price)}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="renew-payment">Thanh toán phí hội viên</Label>
                  <Select
                    id="renew-payment"
                    value={paymentMethod}
                    onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod)}
                  >
                    <option value="CASH">Tiền mặt</option>
                    <option value="TRANSFER">Chuyển khoản</option>
                    <option value="CARD">Thẻ</option>
                  </Select>
                </div>
                {selectedPlan && (
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-600 dark:text-zinc-300">Phí hội viên</span>
                    <span className="font-semibold text-zinc-950 dark:text-white">
                      {money(selectedPlan.price)}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}

function CheckoutDrawer({
  session,
  products,
  shiftReady,
  submitting,
  setSubmitting,
  onClose,
  onDone,
}: {
  session: SessionRow | null
  products: Product[]
  shiftReady: boolean
  submitting: boolean
  setSubmitting: (value: boolean) => void
  onClose: () => void
  onDone: () => Promise<void>
}) {
  const { success: notifySuccess, error: notifyError } = useToast()
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH')
  const [cart, setCart] = useState<Record<string, number>>({})
  const [checkoutPlayerCount, setCheckoutPlayerCount] = useState(1)
  const [playQuote, setPlayQuote] = useState<PlayTimeQuote | null>(null)
  const [promotions, setPromotions] = useState<PromotionSnapshot[]>([])
  const [promotionRuleId, setPromotionRuleId] = useState('')
  const [promotionsLoading, setPromotionsLoading] = useState(false)
  const [promotionsError, setPromotionsError] = useState('')
  const [quoteLoading, setQuoteLoading] = useState(false)
  const [quoteError, setQuoteError] = useState('')
  const [selectedGroupId, setSelectedGroupId] = useState('')
  const [parkingVehicleCount, setParkingVehicleCount] = useState(0)

  useEffect(() => {
    if (session) {
      /* eslint-disable react-hooks/set-state-in-effect */
      setPaymentMethod(session.customer.type === 'MEMBER' ? 'MEMBER' : 'CASH')
      setCart({})
      setPromotionRuleId('')
      setPromotions([])
      setPromotionsError('')
      const groups = session.pricingGroups ?? []
      const firstActive = groups.find(g => g.remainingCount > 0)
      setSelectedGroupId(firstActive?.id ?? '')
      setCheckoutPlayerCount(firstActive?.remainingCount ?? session.playerCount ?? 1)
      setParkingVehicleCount(0)
      /* eslint-enable react-hooks/set-state-in-effect */
    }
  }, [session])

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (!session) {
      setPlayQuote(null)
      setQuoteError('')
      return
    }

    let cancelled = false
    setPlayQuote(null)
    const loadQuote = async () => {
      setQuoteLoading(true)
      setQuoteError('')
      try {
      const params = new URLSearchParams()
      if (promotionRuleId) params.set('promotionRuleId', promotionRuleId)
      if (selectedGroupId) params.set('pricingGroupId', selectedGroupId)
      const qs = params.toString()
      const data = await apiJson<PlayTimeQuote>(`/api/sessions/${session.id}/checkout-preview${qs ? `?${qs}` : ''}`)
        if (!data.success || !data.data) {
          throw new Error(data.error || 'Không tính được tiền giờ chơi')
        }
        if (!cancelled) setPlayQuote(data.data)
      } catch (quoteLoadError) {
        if (!cancelled) setQuoteError((quoteLoadError as Error).message || 'Không tính được tiền giờ chơi')
      } finally {
        if (!cancelled) setQuoteLoading(false)
      }
    }

    void loadQuote()
    const intervalId = window.setInterval(() => void loadQuote(), 30_000)
    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [session, promotionRuleId])

  useEffect(() => {
    if (!session || session.customer.type === 'MEMBER') return

    let cancelled = false
    const loadPromotions = async () => {
      setPromotionsLoading(true)
      setPromotionsError('')
      try {
        const data = await apiJson<PromotionSnapshot[]>('/api/promotions/available')
        if (!data.success) {
          throw new Error(data.error || 'Không tải được khuyến mại')
        }
        if (!cancelled) setPromotions(data.data ?? [])
      } catch (promotionLoadError) {
        if (!cancelled) {
          setPromotions([])
          setPromotionsError((promotionLoadError as Error).message || 'Không tải được khuyến mại')
        }
      } finally {
        if (!cancelled) setPromotionsLoading(false)
      }
    }

    void loadPromotions()
    return () => { cancelled = true }
  }, [session])

  const isMember = session?.customer.type === 'MEMBER'
  const sessionPlayerCount = session?.playerCount ?? 1
  const isGroupSession = sessionPlayerCount > 1
  const perPersonSubtotal = playQuote?.subtotal ?? 0
  const perPersonDiscount = playQuote?.discountAmount ?? 0
  const perPersonTotal = playQuote?.grandTotal ?? 0
  const playSubtotal = perPersonSubtotal * checkoutPlayerCount
  const playDiscount = perPersonDiscount * checkoutPlayerCount
  const playTotal = perPersonTotal * checkoutPlayerCount
  const pendingSellTotal = playQuote?.pendingSellTotal ?? 0
  const pendingSellItems = playQuote?.pendingSellItems ?? []
  const parkingFeeUnitPrice = playQuote?.parkingFeeUnitPrice ?? 0
  const parkingFeeTotal = parkingVehicleCount * parkingFeeUnitPrice

  const cartLines = products
    .map((product) => ({
      product,
      quantity: cart[product.id] ?? 0,
      total: (cart[product.id] ?? 0) * toNumber(product.price),
    }))
    .filter((line) => line.quantity > 0)

  const productSubtotal = cartLines.reduce((sum, line) => sum + line.total, 0)
  const grandTotal = Math.max(0, playTotal + pendingSellTotal + productSubtotal - parkingFeeTotal)

  const changeCart = (product: Product, delta: number) => {
    setCart((current) => {
      const currentQuantity = current[product.id] ?? 0
      const nextQuantity = currentQuantity + delta
      if (nextQuantity <= 0) {
        const next = { ...current }
        delete next[product.id]
        return next
      }
      if (product.type === 'PRODUCT' && nextQuantity > product.stockQuantity) return current
      return { ...current, [product.id]: nextQuantity }
    })
  }

  const handleCheckout = async () => {
    if (!session) return
    if (!shiftReady) {
      notifyError('Cần mở ca trước khi thu tiền')
      return
    }

    setSubmitting(true)
    try {
      const body: Record<string, unknown> = {
        paymentMethod,
        promotionRuleId: promotionRuleId || null,
        items: cartLines.map((line) => ({
          productId: line.product.id,
          quantity: line.quantity,
        })),
      }
      // Nếu có pricing groups, gửi pricingGroupId
      const groups = session.pricingGroups ?? []
      if (selectedGroupId && groups.some(g => g.id === selectedGroupId)) {
        body.pricingGroupId = selectedGroupId
        body.playerCount = checkoutPlayerCount
      } else if (isGroupSession && checkoutPlayerCount < sessionPlayerCount) {
        body.playerCount = checkoutPlayerCount
      }
      if (parkingVehicleCount > 0) {
        body.parkingVehicleCount = parkingVehicleCount
      }
      const data = await apiJson<CheckoutResponse>(`/api/sessions/${session.id}/checkout`, jsonRequest(body))

      if (!data.success) {
        notifyError(data.error || 'Không checkout được')
        return
      }

      notifySuccess(`Đã thu ${money(data.data?.grandTotal ?? grandTotal)}`)
      await onDone()
    } catch {
      notifyError('Lỗi kết nối máy chủ')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={!!session}
      onClose={onClose}
      title={session ? `Thu tiền - ${session.customer.fullName}` : 'Thu tiền'}
      description={session
        ? `${isMember ? 'Hội viên' : 'Vãng lai'} · ${calcElapsedHMS(session.startTime)}${isGroupSession ? ` · ${sessionPlayerCount} người` : ''}`
        : undefined}
      size="lg"
      footer={
        <Button
          variant="inverse"
          size="lg"
          fullWidth
          disabled={submitting || !shiftReady || quoteLoading || !!quoteError || !playQuote}
          onClick={handleCheckout}
        >
          {submitting
            ? 'Đang thu tiền...'
            : selectedGroupId && checkoutPlayerCount < (session?.pricingGroups?.find(g => g.id === selectedGroupId)?.remainingCount ?? sessionPlayerCount)
              ? `Thu tiền ${checkoutPlayerCount} người`
              : (selectedGroupId && (session?.pricingGroups?.length ?? 0) > 0)
                ? `Thu tiền (${session?.pricingGroups?.find(g => g.id === selectedGroupId)?.label ?? ''})`
                : isGroupSession && checkoutPlayerCount < sessionPlayerCount
                  ? `Thu tiền ${checkoutPlayerCount} người`
                  : 'Thu tiền & kết thúc'}
        </Button>
      }
    >
      {session && (
        <div className="space-y-4">
          {/* Group selection — chỉ khách vãng lai; hội viên không chia nhóm giá */}
          {!isMember && (session.pricingGroups?.length ?? 0) > 0 ? (
            <div className="space-y-2">
              <Label>Nhóm giá</Label>
              {session.pricingGroups!.filter(g => g.remainingCount > 0).map((g) => {
                const isSelected = selectedGroupId === g.id
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => {
                      setSelectedGroupId(g.id)
                      setCheckoutPlayerCount(g.remainingCount)
                    }}
                    className={`flex w-full items-center justify-between rounded-xl border p-3 text-left transition-colors ${
                      isSelected
                        ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10'
                        : 'border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900'
                    }`}
                  >
                    <div>
                      <p className="text-sm font-semibold text-zinc-950 dark:text-white">{g.label}</p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        {g.pricingSnapshot?.name ?? 'Bảng giá'} · {money(g.hourlyRate)}/giờ
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold tabular-nums text-zinc-950 dark:text-white">
                        {g.remainingCount} người
                      </p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        Còn {g.remainingCount}/{g.playerCount}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>
          ) : null}

          {/* Per-group checkout count stepper — chỉ khách vãng lai */}
          {!isMember && selectedGroupId && (session.pricingGroups?.length ?? 0) > 0 && (() => {
            const selectedGroup = session.pricingGroups!.find(g => g.id === selectedGroupId)
            if (!selectedGroup) return null
            const groupMax = selectedGroup.remainingCount
            return (
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950">
                <Label htmlFor="checkout-group-count">Số người checkout từ nhóm này</Label>
                <div className="mt-2 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setCheckoutPlayerCount((c) => Math.max(1, c - 1))}
                    disabled={checkoutPlayerCount <= 1}
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300"
                  >
                    <Minus size={14} />
                  </button>
                  <span className="text-lg font-bold tabular-nums text-zinc-950 dark:text-white">
                    {checkoutPlayerCount}
                  </span>
                  <button
                    type="button"
                    onClick={() => setCheckoutPlayerCount((c) => Math.min(groupMax, c + 1))}
                    disabled={checkoutPlayerCount >= groupMax}
                    className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-950 text-white disabled:opacity-40 dark:bg-white dark:text-zinc-950"
                  >
                    <Plus size={14} />
                  </button>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    / {groupMax} người trong nhóm
                  </span>
                </div>
                {checkoutPlayerCount < groupMax && (
                  <p className="mt-2 text-xs text-amber-600 dark:text-amber-300">
                    Checkout {checkoutPlayerCount} người — nhóm còn {groupMax - checkoutPlayerCount} người tiếp tục chơi
                  </p>
                )}
              </div>
            )
          })()}

          {!isMember && isGroupSession && !selectedGroupId && (
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950">
              <Label htmlFor="checkout-player-count">Số người checkout</Label>
              <div className="mt-2 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setCheckoutPlayerCount((c) => Math.max(1, c - 1))}
                  disabled={checkoutPlayerCount <= 1}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300"
                >
                  <Minus size={14} />
                </button>
                <span className="text-lg font-bold tabular-nums text-zinc-950 dark:text-white">
                  {checkoutPlayerCount}
                </span>
                <button
                  type="button"
                  onClick={() => setCheckoutPlayerCount((c) => Math.min(sessionPlayerCount, c + 1))}
                  disabled={checkoutPlayerCount >= sessionPlayerCount}
                  className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-950 text-white disabled:opacity-40 dark:bg-white dark:text-zinc-950"
                >
                  <Plus size={14} />
                </button>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  / {sessionPlayerCount} người trong phiên
                </span>
              </div>
              {checkoutPlayerCount < sessionPlayerCount && (
                <p className="mt-2 text-xs text-amber-600 dark:text-amber-300">
                  Checkout {checkoutPlayerCount} người — phiên còn {sessionPlayerCount - checkoutPlayerCount} người tiếp tục chơi
                </p>
              )}
            </div>
          )}
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950">
            {quoteLoading ? (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Đang tính tiền giờ chơi...</p>
            ) : quoteError ? (
              <p className="text-sm text-red-600 dark:text-red-300">{quoteError}</p>
            ) : (
              <>
                {isGroupSession ? (
                  <>
                    <InvoiceRow
                      label={`Giờ chơi (${checkoutPlayerCount} người × ${money(perPersonSubtotal)}/người)`}
                      value={money(playSubtotal)}
                    />
                    {perPersonDiscount > 0 && (
                      <div className="mt-2 flex justify-between gap-3 text-sm text-zinc-500 dark:text-zinc-400">
                        <span className="truncate">Giá mỗi người</span>
                        <span className="shrink-0 tabular-nums">{money(perPersonSubtotal)}</span>
                      </div>
                    )}
                  </>
                ) : (
                  <InvoiceRow
                    label={isMember ? 'Giờ chơi hội viên' : 'Giờ chơi vãng lai'}
                    value={money(playSubtotal)}
                  />
                )}
                {playQuote?.promotion && playDiscount > 0 && (
                  <div className="mt-2 flex justify-between gap-3 text-sm text-emerald-700 dark:text-emerald-300">
                    <span className="truncate">Khuyến mại · {playQuote.promotion.name}</span>
                    <span className="shrink-0 tabular-nums">-{money(playDiscount)}</span>
                  </div>
                )}
                {playDiscount > 0 && <InvoiceRow label="Tiền giờ chơi sau giảm" value={money(playTotal)} />}
              </>
            )}
            {pendingSellItems.length > 0 && (
              <div className="border-t border-dashed border-zinc-200 pt-3 dark:border-zinc-800">
                <p className="mb-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  Đã thêm vào phiên (chưa thu)
                </p>
                {pendingSellItems.map((item, index) => (
                  <InvoiceRow
                    key={`${item.productId}-${index}`}
                    label={`${item.productName} x${item.quantity}`}
                    value={money(item.subtotal)}
                  />
                ))}
              </div>
            )}
            {cartLines.map((line) => (
              <InvoiceRow
                key={line.product.id}
                label={`${line.product.name} x${line.quantity}`}
                value={money(line.total)}
              />
            ))}
            {parkingFeeTotal > 0 && (
              <InvoiceRow
                label="Phí gửi xe"
                value={`-${money(parkingFeeTotal)}`}
                warning
              />
            )}
            <div className="mt-3 border-t border-zinc-200 pt-3 dark:border-zinc-800">
              <InvoiceRow label="Tổng thu" value={quoteError ? '—' : money(grandTotal)} strong />
            </div>
          </div>

          {/* Phí gửi xe (trừ vào tổng thanh toán) — chỉ khách vãng lai */}
          {!isMember && parkingFeeUnitPrice > 0 && (
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950">
              <div className="flex items-center justify-between">
                <Label>Phí gửi xe</Label>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  {money(parkingFeeUnitPrice)}/xe
                </span>
              </div>
              <div className="mt-2 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setParkingVehicleCount((c) => Math.max(0, c - 1))}
                  disabled={parkingVehicleCount === 0}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300"
                >
                  <Minus size={14} />
                </button>
                <span className="text-lg font-bold tabular-nums text-zinc-950 dark:text-white">
                  {parkingVehicleCount}
                </span>
                <button
                  type="button"
                  onClick={() => setParkingVehicleCount((c) => Math.min(20, c + 1))}
                  className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-950 text-white disabled:opacity-40 dark:bg-white dark:text-zinc-900"
                >
                  <Plus size={14} />
                </button>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">xe</span>
              </div>
              {parkingVehicleCount > 0 && (
                <div className="mt-2 flex justify-between text-sm">
                  <span className="text-red-500 dark:text-red-300">Tạm tính trừ</span>
                  <span className="font-semibold text-red-600 dark:text-red-300 tabular-nums">
                    -{money(parkingFeeTotal)}
                  </span>
                </div>
              )}
            </div>
          )}

          {!isMember && (
            <div>
              <Label htmlFor="checkout-promotion">Khuyến mại giờ chơi</Label>
              <Select
                id="checkout-promotion"
                value={promotionRuleId}
                disabled={promotionsLoading}
                onChange={(event) => setPromotionRuleId(event.target.value)}
              >
                <option value="">Không áp dụng khuyến mại</option>
                {promotions.map((promotion) => (
                  <option key={promotion.ruleId} value={promotion.ruleId}>
                    {formatPromotionOption(promotion)}
                  </option>
                ))}
              </Select>
              {promotionsError ? (
                <p className="mt-1 text-xs text-red-600 dark:text-red-300">{promotionsError}</p>
              ) : (
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  Chọn một khuyến mại còn hiệu lực tại thời điểm thu tiền.
                </p>
              )}
            </div>
          )}

          {isMember ? (
            <div>
              <Label>Phương thức thanh toán</Label>
              <div className="flex items-center justify-between rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950">
                <span className="text-sm font-medium text-zinc-950 dark:text-white">
                  {paymentMethodLabel('MEMBER')}
                </span>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  Không thu tiền mặt tại quầy
                </span>
              </div>
            </div>
          ) : (
            <div>
              <Label htmlFor="payment-method">Phương thức thanh toán</Label>
              <Select
                id="payment-method"
                value={paymentMethod}
                onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod)}
              >
                <option value="CASH">{paymentMethodLabel('CASH')}</option>
                <option value="TRANSFER">{paymentMethodLabel('TRANSFER')}</option>
                <option value="CARD">{paymentMethodLabel('CARD')}</option>
              </Select>
            </div>
          )}

          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label>Đồ uống / dịch vụ</Label>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                {cartLines.length} món
              </span>
            </div>
            <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {products.length === 0 ? (
                <p className="rounded-lg bg-zinc-50 p-3 text-sm text-zinc-500 dark:bg-zinc-950 dark:text-zinc-400">
                  Chưa có sản phẩm hoặc dịch vụ.
                </p>
              ) : (
                products.map((product) => {
                  const quantity = cart[product.id] ?? 0
                  const outOfStock = product.type === 'PRODUCT' && product.stockQuantity <= 0
                  return (
                    <div
                      key={product.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-800"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-zinc-950 dark:text-white">
                          {product.name}
                        </p>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">
                          {money(product.price)}
                          {product.type === 'PRODUCT' ? ` · còn ${product.stockQuantity}` : ' · dịch vụ'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => changeCart(product, -1)}
                          disabled={quantity === 0}
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300"
                        >
                          <Minus size={14} />
                        </button>
                        <span className="w-5 text-center text-sm tabular-nums text-zinc-950 dark:text-white">
                          {quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => changeCart(product, 1)}
                          disabled={outOfStock}
                          className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-950 text-white disabled:opacity-40 dark:bg-white dark:text-zinc-950"
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}

function SellDialog({
  session,
  products,
  shiftReady,
  submitting,
  setSubmitting,
  onClose,
  onDone,
}: {
  session: SessionRow | null
  products: Product[]
  shiftReady: boolean
  submitting: boolean
  setSubmitting: (value: boolean) => void
  onClose: () => void
  onDone: () => Promise<void>
}) {
  const { success: notifySuccess, error: notifyError } = useToast()
  const [cart, setCart] = useState<Record<string, number>>({})

  useEffect(() => {
    if (session) {
      /* eslint-disable react-hooks/set-state-in-effect */
      setCart({})
      /* eslint-enable react-hooks/set-state-in-effect */
    }
  }, [session])

  const cartLines = products
    .map((product) => ({
      product,
      quantity: cart[product.id] ?? 0,
      total: (cart[product.id] ?? 0) * toNumber(product.price),
    }))
    .filter((line) => line.quantity > 0)

  const grandTotal = cartLines.reduce((sum, line) => sum + line.total, 0)

  const changeCart = (product: Product, delta: number) => {
    setCart((current) => {
      const currentQuantity = current[product.id] ?? 0
      const nextQuantity = currentQuantity + delta
      if (nextQuantity <= 0) {
        const next = { ...current }
        delete next[product.id]
        return next
      }
      if (product.type === 'PRODUCT' && nextQuantity > product.stockQuantity) return current
      return { ...current, [product.id]: nextQuantity }
    })
  }

  const handleSell = async () => {
    if (!session) return
    if (!shiftReady) {
      notifyError('Cần mở ca trước khi thêm vào phiên')
      return
    }
    if (cartLines.length === 0) {
      notifyError('Chưa chọn sản phẩm hoặc dịch vụ')
      return
    }

    setSubmitting(true)
    try {
      const data = await apiJson(`/api/sessions/${session.id}/sell`, jsonRequest({
        items: cartLines.map((line) => ({
          productId: line.product.id,
          quantity: line.quantity,
        })),
      }))

      if (!data.success) {
        notifyError(data.error || 'Không thêm được vào phiên')
        return
      }

      notifySuccess(`Đã thêm ${money(grandTotal)} vào phiên`)
      await onDone()
    } catch {
      notifyError('Lỗi kết nối máy chủ')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={!!session}
      onClose={onClose}
      title={session ? `Bán kèm - ${session.customer.fullName}` : 'Bán kèm'}
      description="Thêm đồ uống / dịch vụ vào phiên. Tiền sẽ được tính khi thu."
      size="lg"
      footer={
        <Button
          variant="primary"
          size="lg"
          fullWidth
          disabled={submitting || !shiftReady || cartLines.length === 0}
          onClick={handleSell}
        >
          {submitting ? 'Đang xử lý...' : `Thêm vào phiên ${money(grandTotal)}`}
        </Button>
      }
    >
      {session && (
        <div className="space-y-4">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label>Đồ uống / dịch vụ</Label>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                {cartLines.length} món
              </span>
            </div>
            <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {products.length === 0 ? (
                <p className="rounded-lg bg-zinc-50 p-3 text-sm text-zinc-500 dark:bg-zinc-950 dark:text-zinc-400">
                  Chưa có sản phẩm hoặc dịch vụ.
                </p>
              ) : (
                products.map((product) => {
                  const quantity = cart[product.id] ?? 0
                  const outOfStock = product.type === 'PRODUCT' && product.stockQuantity <= 0
                  return (
                    <div
                      key={product.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-800"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-zinc-950 dark:text-white">
                          {product.name}
                        </p>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">
                          {money(product.price)}
                          {product.type === 'PRODUCT' ? ` · còn ${product.stockQuantity}` : ' · dịch vụ'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => changeCart(product, -1)}
                          disabled={quantity === 0}
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300"
                        >
                          <Minus size={14} />
                        </button>
                        <span className="w-5 text-center text-sm tabular-nums text-zinc-950 dark:text-white">
                          {quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => changeCart(product, 1)}
                          disabled={outOfStock}
                          className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-950 text-white disabled:opacity-40 dark:bg-white dark:text-zinc-950"
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}

function SellPickDialog({
  open,
  sessions,
  onClose,
  onSelect,
}: {
  open: boolean
  sessions: SessionRow[]
  onClose: () => void
  onSelect: (session: SessionRow) => void
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Chọn phiên để bán kèm"
      size="sm"
    >
      <div className="space-y-2">
        {sessions.map((session) => (
          <button
            key={session.id}
            type="button"
            onClick={() => onSelect(session)}
            className="flex w-full items-center justify-between rounded-lg border border-zinc-200 px-3 py-3 text-left transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
          >
            <div>
              <p className="text-sm font-semibold text-zinc-950 dark:text-white">
                {session.customer.fullName}
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {calcElapsedHMS(session.startTime)} · {formatClock(session.startTime)}
              </p>
            </div>
            <Badge variant={session.customer.type === 'MEMBER' ? 'purple' : 'default'} size="sm">
              {session.customer.type === 'MEMBER' ? 'Hội viên' : 'Vãng lai'}
            </Badge>
          </button>
        ))}
      </div>
    </Modal>
  )
}

function formatPromotionOption(promotion: PromotionSnapshot): string {
  if (promotion.discountType === 'PERCENT' || promotion.discountType === 'PERCENT_PLAY_TIME') {
    return `${promotion.name} · Giảm ${promotion.discountValue}%`
  }
  if (promotion.discountType === 'FIXED_PER_HOUR') {
    return `${promotion.name} · Giảm ${money(promotion.discountValue)}/giờ`
  }
  return `${promotion.name} · Giảm ${money(promotion.discountValue)}`
}

function InvoiceRow({
  label,
  value,
  strong,
  warning,
}: {
  label: string
  value: string
  strong?: boolean
  warning?: boolean
}) {
  const valueClass = warning
    ? 'tabular-nums text-red-600 dark:text-red-300'
    : 'tabular-nums text-zinc-950 dark:text-white'
  const labelClass = strong
    ? 'text-zinc-950 dark:text-white'
    : warning
      ? 'text-red-500 dark:text-red-300'
      : 'text-zinc-500 dark:text-zinc-400'

  return (
    <div className={`flex justify-between gap-3 text-sm ${strong ? 'font-semibold' : ''}`}>
      <span className={labelClass}>
        {label}
      </span>
      <span className={valueClass}>
        {value}
      </span>
    </div>
  )
}

function ToolCountFields({
  tools,
  values,
  onChange,
}: {
  tools: { id: string; name: string; quantity: number; isRequired: boolean }[]
  values: Record<string, string>
  onChange: (values: Record<string, string>) => void
}) {
  if (tools.length === 0) return null

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-zinc-950 dark:text-white">
        Kiểm đếm dụng cụ
      </p>
      <div className="grid gap-2 md:grid-cols-2">
        {tools.map((tool) => (
          <div key={tool.id}>
            <div className="flex items-baseline justify-between gap-2">
              <Label htmlFor={`tool-${tool.id}`}>
                {tool.name}
                {tool.isRequired && <span className="ml-1 text-red-500">*</span>}
              </Label>
              {tool.quantity > 0 && (
                <span className="shrink-0 text-[10px] text-zinc-400 dark:text-zinc-500">
                  Chuẩn: {tool.quantity}
                </span>
              )}
            </div>
            <Input
              id={`tool-${tool.id}`}
              type="number"
              min={0}
              value={values[tool.id] ?? ''}
              onChange={(event) => onChange({ ...values, [tool.id]: event.target.value })}
              placeholder="0"
            />
          </div>
        ))}
      </div>
    </div>
  )
}
