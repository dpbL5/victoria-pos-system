'use client'

/**
 * ── DIRECTION CONTRACT — Ca hôm nay (màn /sessions) ────────────────────────
 * THESIS: Màn này có BA hình dạng, không phải một danh sách card xếp chồng.
 *   (A) STAFF chưa vào ca thì cả màn chỉ còn một việc; (B) đang trong ca thì
 *   phiên chơi chiếm phần còn lại; (C) ADMIN/MANAGER chưa vào ca thì bảng vẫn
 *   hiện ở chế độ CHỈ XEM — không render nút thao tác nào, chỉ một lối vào ca.
 *   Từ chối: bốn card luôn hiện (hai card rỗng) + một overlay modal
 *   `fixed inset-0` phủ lên chính màn hình vốn đã trống, và từ chối nút bật mà
 *   bấm vào là lỗi (thao tác tiền cần ca của chính mình — `canOperate`, đúng
 *   bằng guard `SHIFT_REQUIRED` của backend).
 * OWN-WORLD: Ink & Gold Ledger — thang neutral zinc, vàng #ffd444 chỉ làm HÌNH
 *   (1.43:1 trên trắng, không bao giờ là chữ trên nền sáng); khi cần vàng làm
 *   chữ thì dùng bước đậm #8a6a00 (5.07:1). Phẳng mặc định, viền hairline 1px,
 *   chữ 12/14px, số tabular-nums. Nguồn màu: src/app/globals.css.
 * STORY: Nhân viên biết ngay mình đang ở chế độ nào, việc kế tiếp là gì, và
 *   phiên nào đang cần chú ý (tạm dừng / chưa thu hết).
 * FIRST VIEWPORT (mobile 390px): STAFF chưa vào ca → một panel duy nhất, canh
 *   giữa, status mark + tiêu đề + một nút contrast, không nút disabled, cộng
 *   một dòng link "Lịch đặt" để giữ lối vào /bookings. Đang trong ca → dải ca
 *   2 dòng (chấm trạng thái + tiền đầu ca), hàng 3 hành động cao 56px, rồi danh
 *   sách phiên. Chế độ chỉ xem → cùng dải ca đó nhưng có nhãn "Chỉ xem", không
 *   hàng hành động, và mỗi phiên không có nút Dừng/Thu. Không hành động nào nằm
 *   sau một lần bấm mở rộng.
 * FORM: code-led (không sinh comp). Seed key b03671b6, dealt #4 of 7.
 * FINISH: unreviewed and undocumented is unfinished; this build ends with the
 *   finish review, the verdict, and DESIGN.md.
 * ──────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSWRConfig } from 'swr'
import {
  ChevronDown,
  Search,
  Timer,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { NoticeCard } from '@/components/ui/notice-card'
import { AppSkeleton } from '@/components/ui/skeleton'
import { useToast } from '@/components/ui/toast'
import { apiJson, jsonRequest } from '@/lib/api'
import { usePageRefresh } from '@/components/layout/page-refresh-context'
import { PAGE_TITLE_CLASS } from '@/components/ui/page-title'
import { useApi } from '@/hooks/use-api'
import { getBoardAccess } from './board-access'
import { QuickActions } from './quick-actions'
import { SellPickDialog } from './sell-pick-dialog'
import { ShiftGate } from './shift-gate'
import { ShiftStrip } from './shift-strip'
import { ActiveSessionCard } from './active-session-card'
import { OpenShiftDialog } from './open-shift-dialog'
import { CloseShiftDialog } from './close-shift-dialog'
import { ToolCountDialog } from './tool-count-dialog'
import { SellDialog } from './sell-dialog'
import { RetailDialog } from './retail-dialog'
import { CheckInDialog } from './check-in-dialog'
import { BookingCards, filterBookingsBySearch, isBookingOnVnDay, type BookingItem } from './booking-list'
import { CheckoutDrawer } from './checkout-drawer'
import type {
  Product,
  SessionRow,
  Shift,
} from './types'

type CheckInMode = 'WALK_IN' | 'MEMBER'

const SHIFT_KEY = '/api/shifts?current=true&openOperational=true'
const SESSIONS_KEY = '/api/sessions?status=ACTIVE&limit=50'
const AUTH_KEY = '/api/auth/me'
const BOOKINGS_KEY = '/api/bookings'
const PRODUCTS_KEY = '/api/products?isActive=true'
const TOOLS_KEY = '/api/tools'

function hasApiError(value: unknown) {
  return !!value && typeof value === 'object' && 'success' in value && value.success === false
}

export function TodayShiftScreen() {
  const router = useRouter()
  const { success: notifySuccess, error: notifyError } = useToast()
  const { mutate: mutateCache } = useSWRConfig()

  const [submitting, setSubmitting] = useState(false)
  const [busyBookingId, setBusyBookingId] = useState<string | null>(null)

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
  const [bookingsOpen, setBookingsOpen] = useState(true)
  const [bookingSearch, setBookingSearch] = useState('')
  const [refreshError, setRefreshError] = useState('')

  const shiftQuery = useApi<{ myShift: Shift | null; openShift: Shift | null }>(SHIFT_KEY)
  const sessionsQuery = useApi<SessionRow[]>(SESSIONS_KEY)
  const authQuery = useApi<{ userId: string; role: string }>(AUTH_KEY)
  const bookingsQuery = useApi<BookingItem[]>(BOOKINGS_KEY)
  const shouldLoadProducts = !!checkoutSession || !!sellSession || retailOpen
  const shouldLoadTools = closeShiftDialog || countToolsDialog
  const productsQuery = useApi<Product[]>(shouldLoadProducts ? PRODUCTS_KEY : null, { revalidateOnMount: true })
  const toolsQuery = useApi<{ id: string; name: string; quantity: number; isRequired: boolean }[]>(shouldLoadTools ? TOOLS_KEY : null, { revalidateOnMount: true })

  const shift = shiftQuery.data?.success ? shiftQuery.data.data?.myShift ?? null : null
  const openOperationalShift = shiftQuery.data?.success ? shiftQuery.data.data?.openShift ?? null : null
  const sessions = sessionsQuery.data?.success ? sessionsQuery.data.data ?? [] : []
  // `GET /api/bookings` trả cả tuần (Mon–Sun) khi không truyền `weekStart`, nên
  // khối "Lịch đặt trong ngày" phải tự lọc theo ngày giờ VN. Cả tuần nằm ở
  // /bookings (nút "Quản lý").
  // ponytail: lọc tại render, không có timer riêng — máy để nguyên màn qua nửa
  // đêm vẫn thấy danh sách hôm qua tới lần render/revalidate kế tiếp (SWR
  // revalidate khi focus lại tab). Muốn chính xác tuyệt đối thì cho đồng hồ
  // `useNow()` vào đây và lọc theo nó.
  const bookings = bookingsQuery.data?.success
    ? (bookingsQuery.data.data ?? []).filter((booking) => (
        booking.status === 'BOOKED' && isBookingOnVnDay(booking)
      ))
    : []
  // Tìm nhanh trong khối Lịch đặt: chỉ lọc danh sách đã tải, gõ không dấu vẫn khớp.
  const visibleBookings = filterBookingsBySearch(bookings, bookingSearch)
  const products = productsQuery.data?.success ? productsQuery.data.data ?? [] : []
  const tools = toolsQuery.data?.success ? toolsQuery.data.data ?? [] : []
  const authUserId = authQuery.data?.success ? authQuery.data.data?.userId ?? null : null
  const authRole = authQuery.data?.success ? authQuery.data.data?.role ?? null : null
  const loading = shiftQuery.isLoading || sessionsQuery.isLoading || authQuery.isLoading || bookingsQuery.isLoading
  const error = refreshError
    || shiftQuery.error?.message
    || sessionsQuery.error?.message
    || authQuery.error?.message
    || bookingsQuery.error?.message
    || (!shiftQuery.data?.success ? shiftQuery.data?.error : undefined)
    || (!sessionsQuery.data?.success ? sessionsQuery.data?.error : undefined)
    || (!authQuery.data?.success ? authQuery.data?.error : undefined)
    || (!bookingsQuery.data?.success ? bookingsQuery.data?.error : undefined)
    || ''
  const productsError = productsQuery.error?.message
    ?? (!productsQuery.data?.success ? productsQuery.data?.error : undefined)
    ?? ''
  const toolsError = toolsQuery.error?.message
    ?? (!toolsQuery.data?.success ? toolsQuery.data?.error : undefined)
    ?? ''
  const productsLoading = productsQuery.isLoading && !productsQuery.data
  const toolsLoading = toolsQuery.isLoading && !toolsQuery.data
  // Đồng hồ realtime nằm trong từng thẻ phiên (`useNow` ở ActiveSessionCard /
  // PlayerPauseCard), không tick ở đây — tick ở màn gốc làm cả màn + mọi dialog
  // re-render mỗi giây.

  const refreshResources = useCallback(async (keys: string[]) => {
    const results = await Promise.allSettled(keys.map((key) => Promise.resolve().then(() => mutateCache(key))))
    return results.every((result) => result.status === 'fulfilled' && !hasApiError(result.value))
  }, [mutateCache])

  const retryProducts = useCallback(() => {
    void productsQuery.mutate().catch(() => undefined)
  }, [productsQuery.mutate])

  const retryTools = useCallback(() => {
    void toolsQuery.mutate().catch(() => undefined)
  }, [toolsQuery.mutate])

  const refreshHome = useCallback(async () => {
    setRefreshError('')
    const refreshed = await refreshResources([SHIFT_KEY, SESSIONS_KEY, AUTH_KEY, BOOKINGS_KEY])
    if (!refreshed) setRefreshError('Không làm mới được dữ liệu. Hãy thử tải lại.')
  }, [refreshResources])

  const refreshAfterMutation = useCallback(async (keys: string[], message: string) => {
    const refreshed = await refreshResources(keys)
    setRefreshError(refreshed ? '' : message)
    return refreshed
  }, [refreshResources])

  const updateSessions = useCallback((update: (current: SessionRow[]) => SessionRow[]) => {
    void sessionsQuery.mutate((current) => current?.success
      ? { ...current, data: update(current.data ?? []) }
      : current, { revalidate: false })
  }, [sessionsQuery.mutate])

  const handleBookingCheckIn = async (booking: BookingItem, startTime: string) => {
    setBusyBookingId(booking.id)
    setSubmitting(true)
    try {
      const response = await apiJson(`/api/bookings/${booking.id}`, {
        ...jsonRequest({ action: 'check-in', startTime }),
        method: 'PATCH',
      })
      if (!response.success) {
        notifyError(response.error || 'Không xác nhận được lịch')
        return
      }
      void bookingsQuery.mutate((current) => current?.success
        ? { ...current, data: (current.data ?? []).filter((item) => item.id !== booking.id) }
        : current, { revalidate: false })
      notifySuccess('Đã xác nhận lịch và bắt đầu phiên chơi')
      await refreshAfterMutation([SESSIONS_KEY, BOOKINGS_KEY], 'Đã xác nhận lịch nhưng danh sách chưa cập nhật. Không xác nhận lại; hãy tải lại màn hình.')
    } catch {
      notifyError('Lỗi kết nối máy chủ')
    } finally {
      setBusyBookingId(null)
      setSubmitting(false)
    }
  }

  const handleBookingCancel = async (booking: BookingItem, depositRefunded: boolean) => {
    setBusyBookingId(booking.id)
    try {
      const response = await apiJson(`/api/bookings/${booking.id}`, {
        ...jsonRequest({ status: 'CANCELLED', ...(depositRefunded ? { depositRefunded: true } : {}) }),
        method: 'PATCH',
      })
      if (!response.success) {
        notifyError(response.error || 'Không hủy được lịch')
        return
      }
      void bookingsQuery.mutate((current) => current?.success
        ? { ...current, data: (current.data ?? []).filter((item) => item.id !== booking.id) }
        : current, { revalidate: false })
        notifySuccess('Đã hủy lịch quá giờ hẹn')
        await refreshAfterMutation([BOOKINGS_KEY], 'Đã hủy lịch nhưng danh sách chưa cập nhật. Không hủy lại; hãy tải lại màn hình.')
    } catch {
      notifyError('Lỗi kết nối máy chủ')
    } finally {
      setBusyBookingId(null)
    }
  }

  const { registerRefresh } = usePageRefresh()

  useEffect(() => {
    return registerRefresh(() => void refreshHome())
  }, [registerRefresh, refreshHome])

  const activePlayers = sessions.reduce(
    (total, session) => total + (session.pricingGroups?.length
      ? session.pricingGroups.reduce((count, group) => count + group.remainingCount, 0)
      : session.playerCount),
    0
  )
  // Phiên đang tạm dừng là phiên đang không được tính tiền — đếm lên header
  // để trạng thái cần chú ý không bị chôn trong danh sách.
  const pausedCount = sessions.filter((session) => session.pausedAt).length
  // ── Quyền trên bảng: thao tác tiền ≠ được xem bảng ──
  // ADMIN/MANAGER xem được phiên đang chơi + lịch đặt dù chưa vào ca (chỉ xem);
  // mọi hành động tiền vẫn cần ca của chính mình — đúng bằng guard
  // `SHIFT_REQUIRED` của backend nên không còn nút bật mà bấm vào là lỗi.
  const { canOperate, canMonitor, showBoard } = getBoardAccess(authRole, !!shift)
  // Ca để hiển thị ở dải ca: ca của mình, hoặc ca quầy đang mở của người khác
  // (chế độ giám sát) — để quản lý biết mình đang xem ca nào và vào được ca đó.
  const boardShift = shift ?? openOperationalShift
  const canJoinBoardShift = !!boardShift && boardShift.status === 'OPEN' && !!authUserId
    && !boardShift.participants?.some((participant) => (
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
      setOpenShiftDialog(false)
      const refreshed = await refreshAfterMutation([SHIFT_KEY], 'Đã mở ca nhưng trạng thái chưa cập nhật. Hãy tải lại màn hình trước khi thao tác tiếp.')
      notifySuccess(refreshed ? data.message || 'Đã mở hoặc tham gia ca' : 'Đã mở ca; trạng thái đang được làm mới.')
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
      setCloseShiftDialog(false)
      const refreshed = await refreshAfterMutation([SHIFT_KEY, SESSIONS_KEY], 'Đã đóng ca nhưng dữ liệu chưa cập nhật. Hãy tải lại màn hình.')
      notifySuccess(refreshed ? 'Đã đóng ca' : 'Đã đóng ca; trạng thái đang được làm mới.')
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
    updateSessions((current) => current.map((s) => (
      s.id === session.id ? { ...s, pausedAt } : s
    )))
    setSubmitting(true)
    try {
      const data = await apiJson(`/api/sessions/${session.id}/pause`, jsonRequest({}))
      if (!data.success) {
        updateSessions((current) => current.map((s) => (
          s.id === session.id ? { ...s, pausedAt: previousPausedAt } : s
        )))
        notifyError(data.error || 'Không tạm dừng được')
        return
      }
      notifySuccess('Đã cho phiên nghỉ')
    } catch {
      updateSessions((current) => current.map((s) => (
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
    updateSessions((current) => current.map((s) => {
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
        updateSessions((current) => current.map((s) => (
          s.id === session.id
          ? { ...s, pausedAt: previousPausedAt, totalPausedSeconds: previousTotalPaused }
          : s
        )))
        notifyError(data.error || 'Không tiếp tục được')
        return
      }
      // Reconciliation: thay optimistic bằng pausedSeconds thật từ server
      const resumedSeconds = data.data?.pausedSeconds ?? 0
      updateSessions((current) => current.map((s) => (
        s.id === session.id
          ? { ...s, pausedAt: null, totalPausedSeconds: previousTotalPaused + resumedSeconds }
          : s
      )))
      notifySuccess('Đã tiếp tục phiên')
    } catch {
      updateSessions((current) => current.map((s) => (
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
    updateSessions((current) => current.map((s) => {
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
    updateSessions((current) => current.map((s) => {
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

  // Khối lịch đặt dùng ở CẢ HAI chế độ: một lịch đến giờ là việc thật kể cả khi
  // chưa mở ca, và ở mobile đây là lối vào /bookings duy nhất (bottom nav không
  // có mục Lịch đặt). Ở chế độ A nó chỉ hiện khi thật sự có lịch.
  const bookingsBlock = bookings.length > 0 ? (
    <section className="rounded-xl border border-border-default bg-surface-elevated shadow-sm">
      {/* Không đặt `border-b` ở đây: khi thu gọn nó chồng lên viền dưới của thẻ
          thành đường kẻ dày 2-3px. Đường phân cách nằm trong phần nội dung
          (border-t của ô tìm kiếm) nên tự biến mất khi đóng. */}
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <h2 className="min-w-0 text-sm font-semibold text-text-primary">
          {/* Cả tiêu đề là nút đóng/mở; chevron xoay 180° như thẻ phiên nhóm. */}
          <button
            type="button"
            className="flex items-center gap-2 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            aria-expanded={bookingsOpen}
            aria-controls="today-bookings"
            title={bookingsOpen ? 'Thu gọn lịch đặt' : 'Mở rộng lịch đặt'}
            onClick={() => setBookingsOpen((open) => !open)}
          >
            Lịch đặt trong ngày
            <span className="text-xs font-normal tabular-nums text-text-tertiary">
              {bookings.length}
            </span>
            <ChevronDown
              size={14}
              aria-hidden
              className={`text-text-tertiary transition-transform duration-200 ${bookingsOpen ? 'rotate-180' : ''}`}
            />
          </button>
        </h2>
        <Button variant="white" size="sm" onClick={() => router.push('/bookings')}>
          Quản lý
        </Button>
      </div>
      {/* Grid-rows 0fr→1fr để đóng/mở mượt, giữ nội dung trong DOM. `inert` khi
          đóng để ô tìm kiếm/nút bên trong không nhận focus bằng bàn phím. */}
      <div
        id="today-bookings"
        className="grid transition-[grid-template-rows,opacity] duration-200 ease-out"
        style={{ gridTemplateRows: bookingsOpen ? '1fr' : '0fr', opacity: bookingsOpen ? 1 : 0 }}
        aria-hidden={!bookingsOpen}
        inert={!bookingsOpen}
      >
        <div className="overflow-hidden">
          <div className="border-y border-border-default px-4 py-2.5">
            <div className="relative">
              <Search
                size={14}
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-tertiary"
              />
              <Input
                type="search"
                value={bookingSearch}
                onChange={(event) => setBookingSearch(event.target.value)}
                placeholder="Tìm khách theo tên hoặc SĐT"
                aria-label="Tìm lịch đặt trong ngày"
                className="h-9 border-border-default bg-surface-elevated py-0 pr-3 pl-8"
              />
            </div>
          </div>
          {visibleBookings.length > 0 ? (
            <BookingCards
              bookings={visibleBookings}
              // Chế độ giám sát (chưa vào ca): không truyền handler → BookingCards
              // render hàng chữ trần, không còn nút xám vô nghĩa.
              onCheckIn={canOperate ? (booking, startTime) => void handleBookingCheckIn(booking, startTime) : undefined}
              onCancel={canOperate ? (booking, depositRefunded) => void handleBookingCancel(booking, depositRefunded) : undefined}
              busyId={busyBookingId}
              actionDisabled={!canOperate}
              shiftOpenedAt={shift?.openedAt}
            />
          ) : (
            <p className="px-4 py-3 text-sm text-text-tertiary">Không tìm thấy lịch phù hợp</p>
          )}
        </div>
      </div>
    </section>
  ) : (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border-default bg-surface-elevated px-4 py-2.5">
      <p className="min-w-0 truncate text-xs text-text-tertiary">
        Không có lịch đặt hôm nay
      </p>
      <Button variant="ghost" size="sm" onClick={() => router.push('/bookings')}>
        Lịch đặt
      </Button>
    </div>
  )

  // Chế độ A vẫn phải giữ lối vào /bookings — bottom nav trên mobile không có
  // mục Lịch đặt, nên bỏ nó đi là chặn đường duy nhất tới màn đó. Nhưng chỉ MỘT
  // dòng link, không dùng lại bookingsBlock: panel đó mang nút "Xác nhận & Chơi"
  // và ở chế độ A nút ấy sẽ render disabled, phá đúng lời hứa "không nút disabled".
  const bookingsLinkRow = (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border-default bg-surface-elevated px-4 py-2.5">
      <p className="min-w-0 truncate text-xs text-text-tertiary">
        {bookings.length > 0
          ? `${bookings.length} lịch đặt hôm nay`
          : 'Không có lịch đặt hôm nay'}
      </p>
      <Button variant="ghost" size="sm" onClick={() => router.push('/bookings')}>
        Lịch đặt
      </Button>
    </div>
  )

  if (loading) {
    return <AppSkeleton />
  }

  return (
    <div className="min-h-full bg-surface-secondary px-4 py-4 md:px-6 md:py-6">
      <div className="mx-auto flex max-w-content flex-col gap-4">
        <header className="hidden md:block">
          <h1 className={PAGE_TITLE_CLASS}>
            Ca hôm nay
          </h1>
        </header>

        {error && (
          <NoticeCard
            tone="danger"
            title="Không tải được dữ liệu"
            description={error}
            action={<Button variant="white" size="sm" onClick={() => void refreshHome()}>Thử lại</Button>}
          />
        )}

        {!showBoard ? (
          <>
            <ShiftGate
              openShiftAt={openOperationalShift?.openedAt ?? null}
              submitting={submitting}
              onOpen={() => setOpenShiftDialog(true)}
            />
            {bookingsLinkRow}
          </>
        ) : (
          <>
            {/* Desktop: dải ca + 3 hành động chính là MỘT hàng. Dải ca co giãn
                trong khoảng 26rem trở lên (`flex-1` + `basis`), hành động giữ track
                cố định và dồn sang phải — tỷ lệ do bề rộng nút của dải quyết định,
                không phải chia đều 50/50. Hẹp hơn mức đó (tablet, cửa sổ nhỏ) thì
                `flex-wrap` đẩy hàng nút xuống dưới y như cũ, thay vì bóp dải ca.
                Điện thoại xếp dọc.

                `lg:items-stretch`: ô hành động cao bằng dải ca (grid item tự giãn
                theo chiều cao của hàng) nên hai khối thành một band, thay vì ô
                56px lơ lửng giữa card 110px. Chỉ desktop — mobile giữ 56px để
                ngón tay bấm đúng chỗ. */}
            <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-stretch lg:justify-end lg:gap-3">
              <ShiftStrip
                className="lg:min-w-0 lg:flex-1 lg:basis-[26rem]"
                shift={boardShift}
                readOnly={!canOperate}
                onOpen={() => setOpenShiftDialog(true)}
                onClose={() => setCloseShiftDialog(true)}
                onViewTransactions={() => {
                  if (boardShift) router.push(`/transactions?shiftId=${boardShift.id}`)
                }}
                onCountTools={() => setCountToolsDialog(true)}
                hasCounted={hasCountedTools}
                canJoin={canJoinBoardShift}
                onJoin={() => void handleOpenShift()}
                submitting={submitting}
              />

              {/* Chế độ giám sát không có hàng hành động: cả 3 tile đều là thao tác
                  tiền, mà thao tác tiền cần ca của chính mình. */}
              {canOperate && (
              <QuickActions
                shiftReady={canOperate}
                sellDisabled={sessions.length === 0}
                retailDisabled={!canOperate}
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
              )}
            </div>

            {bookingsBlock}

            <section className="rounded-xl border border-border-default bg-surface-elevated shadow-sm">
              <div className="flex items-baseline justify-between gap-3 border-b border-border-default px-4 py-3">
                <h2 className="text-sm font-semibold text-text-primary">Đang chơi</h2>
                <p className="min-w-0 truncate text-xs tabular-nums text-text-tertiary">
                  {activePlayers} người chơi
                  {pausedCount > 0 && (
                    <span className="text-warning"> · {pausedCount} tạm dừng</span>
                  )}
                </p>
              </div>

              {sessions.length === 0 ? (
                <EmptyState
                  icon={Timer}
                  message="Chưa có phiên đang chơi"
                  description={canOperate
                    ? 'Bắt đầu bằng một lượt check-in.'
                    : canMonitor ? 'Chưa có phiên nào đang chơi.' : 'Mở ca để bắt đầu vận hành.'}
                />
              ) : (
                <div className="divide-y divide-border-default">
                  {sessions.map((session, index) => (
                    <ActiveSessionCard
                      key={session.id}
                      session={session}
                      index={index}
                      readOnly={!canOperate}
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
          </>
        )}
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
        toolsLoading={toolsLoading}
        toolsError={toolsError}
        onRetryTools={retryTools}
        submitting={submitting}
        onClose={() => setCloseShiftDialog(false)}
        onSubmit={handleCloseShift}
      />

      <ToolCountDialog
        open={countToolsDialog}
        shift={shift}
        tools={tools}
        toolsLoading={toolsLoading}
        toolsError={toolsError}
        onRetryTools={retryTools}
        hasCounted={hasCountedTools}
        submitting={submitting}
        setSubmitting={setSubmitting}
        onClose={() => setCountToolsDialog(false)}
        onDone={async () => {
          setCountToolsDialog(false)
          await refreshAfterMutation([SHIFT_KEY], 'Đã lưu số dụng cụ nhưng ca chưa cập nhật. Hãy tải lại màn hình.')
        }}
      />

      <CheckInDialog
        open={checkInDialog}
        initialMode={checkInInitialMode}
        shiftReady={canOperate}
        shiftOpenedAt={shift?.openedAt}
        submitting={submitting}
        setSubmitting={setSubmitting}
        onClose={() => setCheckInDialog(false)}
        onDone={async () => {
          setCheckInDialog(false)
          await refreshAfterMutation([SESSIONS_KEY], 'Đã check-in thành công nhưng danh sách phiên chưa cập nhật. Hãy tải lại màn hình.')
        }}
      />

      <CheckoutDrawer
        session={checkoutSession}
        frozenAt={checkoutFrozenAt}
        products={products}
        productsLoading={productsLoading}
        productsError={productsError}
        onRetryProducts={retryProducts}
        onItemsOptimistic={(sessionId, itemsTotal) => {
          // Chỉ ghi cache SWR — card phiên đổi số ngay theo đúng thứ nhân viên
          // vừa thấy. KHÔNG refetch ở đây: refetch sớm sẽ đọc DB trước khi PATCH
          // ghi xong và xoá mất số vừa ghi.
          updateSessions((current) =>
            current.map((row) =>
              row.id === sessionId ? { ...row, pendingSellTotal: itemsTotal } : row
            )
          )
        }}
        onItemsSaved={() => refreshAfterMutation(
          [SESSIONS_KEY, PRODUCTS_KEY],
          'Đã lưu hàng hoá nhưng danh sách chưa cập nhật. Hãy tải lại màn hình.'
        )}
        shiftReady={canOperate}
        submitting={submitting}
        setSubmitting={setSubmitting}
        onClose={() => { setCheckoutSession(null); setCheckoutFrozenAt(null) }}
        onDone={async () => {
          const refreshed = await refreshAfterMutation([SESSIONS_KEY, PRODUCTS_KEY], 'Đã ghi nhận thanh toán nhưng dữ liệu chưa cập nhật. Không thu lại; hãy tải lại màn hình.')
          setCheckoutSession(null)
          setCheckoutFrozenAt(null)
          return refreshed
        }}
      />

      <SellDialog
        session={sellSession}
        products={products}
        productsLoading={productsLoading}
        productsError={productsError}
        onRetryProducts={retryProducts}
        shiftReady={canOperate}
        submitting={submitting}
        setSubmitting={setSubmitting}
        onClose={() => setSellSession(null)}
        onDone={async () => {
          const refreshed = await refreshAfterMutation([SESSIONS_KEY, PRODUCTS_KEY], 'Đã thêm hàng vào phiên nhưng danh sách chưa cập nhật. Hãy tải lại màn hình.')
          setSellSession(null)
          return refreshed
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

      <RetailDialog
        open={retailOpen}
        products={products}
        productsLoading={productsLoading}
        productsError={productsError}
        onRetryProducts={retryProducts}
        shiftReady={canOperate}
        submitting={submitting}
        setSubmitting={setSubmitting}
        onClose={() => setRetailOpen(false)}
        onDone={async () => {
          const refreshed = await refreshAfterMutation([PRODUCTS_KEY], 'Đã ghi nhận giao dịch nhưng danh sách hàng chưa cập nhật. Không thu lại; hãy tải lại màn hình.')
          setRetailOpen(false)
          return refreshed
        }}
      />

    </div>
  )
              }
