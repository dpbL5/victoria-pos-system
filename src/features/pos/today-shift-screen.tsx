'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ShieldCheck,
  Timer,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { NoticeCard } from '@/components/ui/notice-card'
import { useToast } from '@/components/ui/toast'
import { apiJson, jsonRequest } from '@/lib/api'
import { usePageRefresh } from '@/components/layout/page-refresh-context'
import { TodayShiftSkeleton } from './today-shift-skeleton'
import { QuickActions } from './quick-actions'
import { SellPickDialog } from './sell-pick-dialog'
import { ShiftRail } from './shift-rail'
import { ActiveSessionCard } from './active-session-card'
import { OpenShiftDialog } from './open-shift-dialog'
import { CloseShiftDialog } from './close-shift-dialog'
import { ToolCountDialog } from './tool-count-dialog'
import { SellDialog } from './sell-dialog'
import { RetailDialog } from './retail-dialog'
import { CheckInDialog } from './check-in-dialog'
import { CheckoutDrawer } from './checkout-drawer'
import type {
  Product,
  SessionRow,
  Shift,
} from './types'

type CheckInMode = 'WALK_IN' | 'MEMBER'

export function TodayShiftScreen() {
  const router = useRouter()
  const { success: notifySuccess, error: notifyError } = useToast()

  const [shift, setShift] = useState<Shift | null>(null)
  const [openOperationalShift, setOpenOperationalShift] = useState<Shift | null>(null)
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [authUserId, setAuthUserId] = useState<string | null>(null)
  const [authRole, setAuthRole] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const [openShiftDialog, setOpenShiftDialog] = useState(false)
  const [closeShiftDialog, setCloseShiftDialog] = useState(false)
  const [countToolsDialog, setCountToolsDialog] = useState(false)
  const [checkInDialog, setCheckInDialog] = useState(false)
  const [checkInInitialMode, setCheckInInitialMode] = useState<CheckInMode>('WALK_IN')
  const [checkoutSession, setCheckoutSession] = useState<SessionRow | null>(null)
  const [checkoutFrozenAt, setCheckoutFrozenAt] = useState<string | null>(null)
  const [sellSession, setSellSession] = useState<SessionRow | null>(null)
  const [sellPickOpen, setSellPickOpen] = useState(false)
  const [retailOpen, setRetailOpen] = useState(false)
  const [tools, setTools] = useState<{ id: string; name: string; quantity: number; isRequired: boolean }[]>([])

  const [, setTick] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => setTick((value) => value + 1), 1000)
    return () => window.clearInterval(id)
  }, [])

  // ── Tải dữ liệu phụ (products/tools) không chặn màn hình ──
  // Màn hình chính chỉ cần shift + sessions + auth. Products/tools chỉ dùng
  // khi mở dialog (checkout/sell/close-shift) → tải sau, không kéo dài thời gian load.
  const loadAuxData = useCallback(async () => {
    try {
      const [productData, toolsData] = await Promise.all([
        apiJson<Product[]>('/api/products?isActive=true'),
        apiJson<{ id: string; name: string; quantity: number; isRequired: boolean }[]>('/api/tools'),
      ])
      if (productData.success) setProducts(productData.data ?? [])
      if (toolsData.success) setTools(toolsData.data ?? [])
    } catch {
      // Không chặn màn hình — khi mở dialog sẽ tự thử lại
    }
  }, [])

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [shiftData, sessionData, authData] = await Promise.all([
        apiJson<{ myShift: Shift | null; openShift: Shift | null }>('/api/shifts?current=true&openOperational=true'),
        apiJson<SessionRow[]>('/api/sessions?status=ACTIVE&limit=50'),
        apiJson<{ userId: string; role: string }>('/api/auth/me'),
      ])

      if (!shiftData.success) throw new Error(shiftData.error || 'Không tải được ca làm')
      if (!sessionData.success) throw new Error(sessionData.error || 'Không tải được phiên chơi')
      if (!authData.success) throw new Error(authData.error || 'Không tải được thông tin đăng nhập')

      setShift(shiftData.data?.myShift ?? null)
      setOpenOperationalShift(shiftData.data?.openShift ?? null)
      setSessions(sessionData.data ?? [])
      setAuthUserId(authData.data?.userId ?? null)
      setAuthRole(authData.data?.role ?? null)
      // Tải products/tools sau — không chờ
      void loadAuxData()
    } catch (err) {
      setError((err as Error).message || 'Lỗi kết nối máy chủ')
    } finally {
      setLoading(false)
    }
  }, [loadAuxData])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadData() }, [loadData])

  const { registerRefresh } = usePageRefresh()

  useEffect(() => {
    return registerRefresh(() => void loadData())
  }, [registerRefresh, loadData])

  const activeWalkIns = sessions.filter((session) => session.customer?.type === 'WALK_IN').length
  const activeMembers = sessions.filter((session) => session.customer?.type === 'MEMBER').length
  const isAdmin = authRole === 'ADMIN'
  const shiftReady = isAdmin || !!shift
  const canJoinCurrentShift = isAdmin && !!authUserId && !!shift && shift.status === 'OPEN'
    && !shift.participants?.some((participant) => (
      !participant.leftAt && participant.staff.id === authUserId
    ))
  // Đã đếm dụng cụ khi có ít nhất một ShiftTool.openCount > 0
  const hasCountedTools = !!shift?.toolCounts?.some((tc) => tc.openCount > 0)

  const handleOpenShift = async (openingCash?: number, notes?: string) => {
    setSubmitting(true)
    try {
      const data = await apiJson<Shift>('/api/shifts', jsonRequest({ openingCash, notes }))
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

  const handlePause = async (session: SessionRow) => {
    // Optimistic update — bật trạng thái paused ngay để UI react tức thì,
    // chỉ revert nếu API thất bại.
    const pausedAt = new Date().toISOString()
    const previousPausedAt = session.pausedAt
    setSessions((current) => current.map((s) => (
      s.id === session.id ? { ...s, pausedAt } : s
    )))
    setSubmitting(true)
    try {
      const data = await apiJson(`/api/sessions/${session.id}/pause`, jsonRequest({}))
      if (!data.success) {
        setSessions((current) => current.map((s) => (
          s.id === session.id ? { ...s, pausedAt: previousPausedAt } : s
        )))
        notifyError(data.error || 'Không tạm dừng được')
        return
      }
      notifySuccess('Đã cho phiên nghỉ')
    } catch {
      setSessions((current) => current.map((s) => (
        s.id === session.id ? { ...s, pausedAt: previousPausedAt } : s
      )))
      notifyError('Lỗi kết nối máy chủ')
    } finally {
      setSubmitting(false)
    }
  }

  const handleResume = async (session: SessionRow) => {
    // Optimistic update — clear pausedAt ngay, cộng dồn pausedSeconds tạm tính
    // (server trả về pausedSeconds thật; chênh lệch chỉ vài giây, không đáng để flicker).
    const previousPausedAt = session.pausedAt
    const previousTotalPaused = session.totalPausedSeconds ?? 0
    setSessions((current) => current.map((s) => {
      if (s.id !== session.id) return s
      const optimisticPausedSeconds = previousPausedAt
        ? Math.max(0, Math.floor((Date.now() - new Date(previousPausedAt).getTime()) / 1000))
        : 0
      return { ...s, pausedAt: null, totalPausedSeconds: previousTotalPaused + optimisticPausedSeconds }
    }))
    setSubmitting(true)
    try {
      const data = await apiJson<{ pausedSeconds?: number }>(`/api/sessions/${session.id}/resume`, jsonRequest({}))
      if (!data.success) {
        setSessions((current) => current.map((s) => (
          s.id === session.id
            ? { ...s, pausedAt: previousPausedAt, totalPausedSeconds: previousTotalPaused }
            : s
        )))
        notifyError(data.error || 'Không tiếp tục được')
        return
      }
      // Reconciliation: thay optimistic bằng pausedSeconds thật từ server
      const resumedSeconds = data.data?.pausedSeconds ?? 0
      setSessions((current) => current.map((s) => (
        s.id === session.id
          ? { ...s, pausedAt: null, totalPausedSeconds: previousTotalPaused + resumedSeconds }
          : s
      )))
      notifySuccess('Đã tiếp tục phiên')
    } catch {
      setSessions((current) => current.map((s) => (
        s.id === session.id
          ? { ...s, pausedAt: previousPausedAt, totalPausedSeconds: previousTotalPaused }
          : s
      )))
      notifyError('Lỗi kết nối máy chủ')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Pause/resume theo từng người chơi (phiên nhiều người) ──
  // Không reload toàn bộ — chỉ cập nhật state cục bộ cho đúng player để
  // tab đó dừng/tiếp tục ngay, các tab khác giữ nguyên.
  const updatePlayerInSession = (sessionId: string, playerId: string, updater: (p: NonNullable<NonNullable<SessionRow['pricingGroups']>[number]['players']>[number]) => NonNullable<NonNullable<SessionRow['pricingGroups']>[number]['players']>[number]) => {
    setSessions((current) => current.map((s) => {
      if (s.id !== sessionId) return s
      return {
        ...s,
        pricingGroups: s.pricingGroups?.map((g) => ({
          ...g,
          players: g.players?.map((p) => (p.id === playerId ? updater(p) : p)),
        })),
      }
    }))
  }

  const handlePausePlayer = async (session: SessionRow, playerId: string) => {
    // Optimistic update — flip pausedAt trước khi gọi API để UI react tức thì.
    const pausedAt = new Date().toISOString()
    let previousPausedAt: string | null | undefined
    setSessions((current) => current.map((s) => {
      if (s.id !== session.id) return s
      return {
        ...s,
        pricingGroups: s.pricingGroups?.map((g) => ({
          ...g,
          players: g.players?.map((p) => {
            if (p.id !== playerId) return p
            previousPausedAt = p.pausedAt
            return { ...p, pausedAt }
          }),
        })),
      }
    }))
    setSubmitting(true)
    try {
      const data = await apiJson(`/api/sessions/${session.id}/players/${playerId}/pause`, jsonRequest({}))
      if (!data.success) {
        updatePlayerInSession(session.id, playerId, (p) => ({ ...p, pausedAt: previousPausedAt ?? p.pausedAt }))
        notifyError(data.error || 'Không tạm dừng được người chơi')
        return
      }
      notifySuccess('Đã cho người chơi nghỉ')
    } catch {
      updatePlayerInSession(session.id, playerId, (p) => ({ ...p, pausedAt: previousPausedAt ?? p.pausedAt }))
      notifyError('Lỗi kết nối máy chủ')
    } finally {
      setSubmitting(false)
    }
  }

  const handleResumePlayer = async (session: SessionRow, playerId: string) => {
    // Optimistic update — clear pausedAt + cộng dồn pausedSeconds tạm tính.
    const group = session.pricingGroups?.find((g) => g.players?.some((p) => p.id === playerId))
    const player = group?.players?.find((p) => p.id === playerId)
    const previousPausedAt = player?.pausedAt ?? null
    const previousTotalPaused = player?.totalPausedSeconds ?? 0
    updatePlayerInSession(session.id, playerId, (p) => {
      const optimisticPausedSeconds = previousPausedAt
        ? Math.max(0, Math.floor((Date.now() - new Date(previousPausedAt).getTime()) / 1000))
        : 0
      return {
        ...p,
        pausedAt: null,
        totalPausedSeconds: (p.totalPausedSeconds ?? 0) + optimisticPausedSeconds,
      }
    })
    setSubmitting(true)
    try {
      const data = await apiJson<{ pausedSeconds?: number }>(`/api/sessions/${session.id}/players/${playerId}/resume`, jsonRequest({}))
      if (!data.success) {
        updatePlayerInSession(session.id, playerId, (p) => ({
          ...p,
          pausedAt: previousPausedAt ?? p.pausedAt,
          totalPausedSeconds: previousTotalPaused || p.totalPausedSeconds,
        }))
        notifyError(data.error || 'Không tiếp tục được người chơi')
        return
      }
      const resumedSeconds = data.data?.pausedSeconds ?? 0
      updatePlayerInSession(session.id, playerId, (p) => ({
        ...p,
        pausedAt: null,
        totalPausedSeconds: previousTotalPaused + resumedSeconds,
      }))
      notifySuccess('Đã tiếp tục người chơi')
    } catch {
      updatePlayerInSession(session.id, playerId, (p) => ({
        ...p,
        pausedAt: previousPausedAt ?? p.pausedAt,
        totalPausedSeconds: previousTotalPaused || p.totalPausedSeconds,
      }))
      notifyError('Lỗi kết nối máy chủ')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Đổi tên 1 người chơi — PATCH theo đúng playerId (giữ định danh timer/pause/pricing) ──
  // Trả true khi thành công để PlayerPauseCard thoát editing.
  // Optimistic update — đổi tên hiển thị ngay, chỉ revert nếu API lỗi.
  const handleRenamePlayer = async (session: SessionRow, playerId: string, name: string) => {
    const trimmed = name.trim() || null
    const previousName = (() => {
      const group = session.pricingGroups?.find((g) => g.players?.some((p) => p.id === playerId))
      const player = group?.players?.find((p) => p.id === playerId)
      return player?.name ?? null
    })()
    updatePlayerInSession(session.id, playerId, (p) => ({ ...p, name: trimmed }))
    setSubmitting(true)
    try {
      const data = await apiJson(`/api/sessions/${session.id}/players/${playerId}`, {
        ...jsonRequest({ name }),
        method: 'PATCH',
      })
      if (!data.success) {
        updatePlayerInSession(session.id, playerId, (p) => ({ ...p, name: previousName }))
        notifyError(data.error || 'Không đổi được tên người chơi')
        return false
      }
      notifySuccess('Đã đổi tên người chơi')
      return true
    } catch {
      updatePlayerInSession(session.id, playerId, (p) => ({ ...p, name: previousName }))
      notifyError('Lỗi kết nối máy chủ')
      return false
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
        <header className="hidden items-center justify-between gap-3 md:flex">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-zinc-950 dark:text-white">
              Ca hôm nay
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
          onCountTools={() => setCountToolsDialog(true)}
          hasCounted={hasCountedTools}
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
          retailDisabled
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
          onRetail={() => setRetailOpen(true)}
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
              {sessions.map((session, index) => (
                <ActiveSessionCard
                  key={session.id}
                  session={session}
                  index={index}
                  checkoutDisabled={!shiftReady}
                  pauseDisabled={!shiftReady}
                  onCheckout={() => { setCheckoutFrozenAt(new Date().toISOString()); setCheckoutSession(session) }}
                  onPause={() => void handlePause(session)}
                  onResume={() => void handleResume(session)}
                  onPausePlayer={(playerId) => void handlePausePlayer(session, playerId)}
                  onResumePlayer={(playerId) => void handleResumePlayer(session, playerId)}
                  onRenamePlayer={(playerId, name) => handleRenamePlayer(session, playerId, name)}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      <OpenShiftDialog
        open={openShiftDialog}
        existingShift={!shift ? openOperationalShift : null}
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

      <ToolCountDialog
        open={countToolsDialog}
        shift={shift}
        tools={tools}
        hasCounted={hasCountedTools}
        submitting={submitting}
        setSubmitting={setSubmitting}
        onClose={() => setCountToolsDialog(false)}
        onDone={async () => {
          setCountToolsDialog(false)
          await loadData()
        }}
      />

      <CheckInDialog
        open={checkInDialog}
        initialMode={checkInInitialMode}
        shiftReady={shiftReady}
        shiftOpenedAt={shift?.openedAt}
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
        frozenAt={checkoutFrozenAt}
        products={products}
        shiftReady={shiftReady}
        submitting={submitting}
        setSubmitting={setSubmitting}
        onClose={() => { setCheckoutSession(null); setCheckoutFrozenAt(null) }}
        onDone={async () => {
          setCheckoutSession(null)
          setCheckoutFrozenAt(null)
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

      {/* <RetailDialog
        open={retailOpen}
        products={products}
        shiftReady={shiftReady}
        submitting={submitting}
        setSubmitting={setSubmitting}
        onClose={() => setRetailOpen(false)}
        onDone={async () => {
          setRetailOpen(false)
          await loadData()
        }}
      /> */}

    </div>
  )
}

