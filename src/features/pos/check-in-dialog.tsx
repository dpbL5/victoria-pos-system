'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Minus, Plus, Search, ShieldCheck, Users } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { useToast } from '@/components/ui/toast'
import { apiJson, jsonRequest } from '@/lib/api'
import { formatDay } from './format'
import type { Customer, Membership, SessionRow } from './types'

type CheckInMode = 'WALK_IN' | 'MEMBER'

interface MemberSearchResult extends Customer {
  membershipStatus?: 'ACTIVE' | 'EXPIRED' | 'NONE'
  currentMembership?: Membership | null
  latestMembership?: Membership | null
}

const MAX_PLAYERS = 50

export function CheckInDialog({
  open,
  initialMode,
  shiftReady,
  shiftOpenedAt,
  submitting,
  setSubmitting,
  onClose,
  onDone,
}: {
  open: boolean
  initialMode: CheckInMode
  shiftReady: boolean
  /** Giờ mở ca (ISO) — chặn check-in trước giờ mở ca */
  shiftOpenedAt?: string | null
  submitting: boolean
  setSubmitting: (value: boolean) => void
  onClose: () => void
  onDone: () => Promise<void>
}) {
  const router = useRouter()
  const { success: notifySuccess, error: notifyError } = useToast()
  const [mode, setMode] = useState<CheckInMode>('WALK_IN')
  const [walkInName, setWalkInName] = useState('')
  const [walkInPhone, setWalkInPhone] = useState('')
  const [playerCountInput, setPlayerCountInput] = useState('1')
  const [memberSearch, setMemberSearch] = useState('')
  const [memberResults, setMemberResults] = useState<MemberSearchResult[]>([])
  const [selectedMember, setSelectedMember] = useState<Customer | null>(null)
  const [currentMembership, setCurrentMembership] = useState<Membership | null>(null)
  const [membershipActive, setMembershipActive] = useState(false)
  const [memberLoading, setMemberLoading] = useState(false)
  const [checkInStartTime, setCheckInStartTime] = useState('')
  const [defaultStartTime, setDefaultStartTime] = useState('')

  useEffect(() => {
    if (!open) return
    /* eslint-disable react-hooks/set-state-in-effect */
    setMode(initialMode)
    setWalkInName('')
    setWalkInPhone('')
    setPlayerCountInput('1')
    setMemberSearch('')
    setMemberResults([])
    setSelectedMember(null)
    setCurrentMembership(null)
    setMembershipActive(false)
    // ── Khởi tạo giờ check-in mặc định = giờ hiện tại (HH:MM) ──
    const now = new Date()
    const nowHHMM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    setDefaultStartTime(nowHHMM)
    setCheckInStartTime(nowHHMM)
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open, initialMode])

  const searchMembers = async () => {
    const q = memberSearch.trim()
    if (!q) return

    setMemberLoading(true)
    setSelectedMember(null)
    setCurrentMembership(null)
    setMembershipActive(false)
    try {
      const data = await apiJson<MemberSearchResult[]>(
        `/api/customers?type=MEMBER&search=${encodeURIComponent(q)}&limit=8&includeMembershipStatus=true`
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

  const loadMembership = async (customer: MemberSearchResult) => {
    setSelectedMember(customer)
    setMemberSearch(customer.fullName)
    setMemberResults([])
    // Kết quả tìm kiếm đã kèm membershipStatus/currentMembership (includeMembershipStatus)
    if (customer.membershipStatus !== undefined) {
      setCurrentMembership(customer.currentMembership ?? null)
      setMembershipActive(customer.membershipStatus === 'ACTIVE')
      return
    }
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

  const parsedPlayerCount = Math.min(MAX_PLAYERS, Math.max(1, Number.parseInt(playerCountInput, 10) || 1))

  const createSession = async (customerId?: string) => {
    const body: Record<string, unknown> = { customerId }
    // Chỉ gửi startTime khi nhân viên chủ động đổi giờ khác mặc định.
    // Mặc định: server lấy giờ hiện tại → phiên luôn bắt đầu sau khi đăng ký/gia hạn xong.
    if (checkInStartTime && checkInStartTime !== defaultStartTime) {
      const [h, m] = checkInStartTime.split(':').map(Number)
      const start = new Date()
      start.setHours(h, m, 0, 0)
      body.startTime = start.toISOString()
    }
    if (mode === 'WALK_IN') {
      // Khách vãng lai: gửi thẳng tên + SĐT (optional) lên phiên — không tạo Customer trong DB
      body.customerName = walkInName.trim()
      if (walkInPhone.trim()) {
        body.customerPhone = walkInPhone.trim()
      }
      // Bảng giá không chọn lúc check-in — để trống, chọn khi thu tiền
      if (parsedPlayerCount > 1) {
        body.playerCount = parsedPlayerCount
      }
    }
    const data = await apiJson<SessionRow>('/api/sessions', jsonRequest(body))
    if (!data.success) {
      notifyError(data.error || 'Không check-in được')
      return false
    }
    return true
  }

  const handleConfirm = async () => {
    if (!shiftReady) {
      notifyError('Cần mở ca trước khi check-in')
      return
    }

    // ── Validate giờ check-in (client-side) ──
    if (checkInStartTime && checkInStartTime !== defaultStartTime) {
      const [h, m] = checkInStartTime.split(':').map(Number)
      const chosen = new Date()
      chosen.setHours(h, m, 0, 0)

      const now = new Date()
      const maxStart = new Date(now.getTime() + 5 * 60 * 60 * 1000)

      if (shiftOpenedAt && chosen < new Date(shiftOpenedAt)) {
        notifyError('Giờ check-in không được trước giờ mở ca')
        return
      }
      if (chosen > maxStart) {
        notifyError('Giờ check-in không được vượt quá 5 tiếng sau thời điểm hiện tại')
        return
      }
    }

    setSubmitting(true)
    try {
      let ok = false

      if (mode === 'WALK_IN') {
        if (!walkInName.trim()) {
          notifyError('Nhập tên khách vãng lai')
          return
        }
        const phone = walkInPhone.trim()
        if (phone && (phone.length < 9 || phone.length > 11)) {
          notifyError('SĐT không hợp lệ (9-11 chữ số)')
          return
        }
        // Khách vãng lai: không tạo Customer — tên được lưu ngay trên phiên
        ok = await createSession()
      } else if (selectedMember && !membershipActive) {
        // Hội viên hết hạn → chuyển sang tab Hội viên để gia hạn, không check-in tại đây
        notifyError('Hội viên hết hạn. Vào tab Hội viên để gia hạn trước khi check-in.')
        onClose()
        router.push('/customers')
        return
      } else if (selectedMember) {
        ok = await createSession(selectedMember.id)
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

  const memberNeedsRenewal = mode === 'MEMBER' && !!selectedMember && !membershipActive

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
          {submitting ? 'Đang xử lý...' : 'Check-in'}
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

        <div className="mt-3">
          <Label htmlFor="check-in-start-time">Giờ check-in</Label>
          <Input
            id="check-in-start-time"
            type="time"
            value={checkInStartTime}
            onChange={(e) => setCheckInStartTime(e.target.value)}
          />
          {/* <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Mặc định là giờ hiện tại. Sửa nếu cần lùi hoặc tiến giờ check-in.
          </p> */}
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
              <Label htmlFor="walk-in-phone">Số điện thoại</Label>
              <Input
                id="walk-in-phone"
                type="tel"
                inputMode="numeric"
                value={walkInPhone}
                onChange={(event) => {
                  const value = event.target.value
                  if (value === '' || /^\d+$/.test(value)) {
                    setWalkInPhone(value.slice(0, 11))
                  }
                }}
                placeholder="Không bắt buộc"
              />
            </div>
            <div className="mt-3">
              <Label htmlFor="player-count">Số người chơi</Label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setPlayerCountInput((current) => {
                      const currentParsed = Math.min(MAX_PLAYERS, Math.max(1, Number.parseInt(current, 10) || 1))
                      return String(Math.max(1, currentParsed - 1))
                    })
                  }
                  disabled={parsedPlayerCount <= 1}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300"
                >
                  <Minus size={14} />
                </button>
                <Input
                  id="player-count"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={2}
                  value={playerCountInput}
                  onChange={(event) => {
                    const value = event.target.value
                    if (value === '' || /^\d+$/.test(value)) {
                      setPlayerCountInput(value)
                    }
                  }}
                  className="w-20 text-center text-lg font-bold tabular-nums"
                />
                <button
                  type="button"
                  onClick={() =>
                    setPlayerCountInput((current) => {
                      const currentParsed = Math.min(MAX_PLAYERS, Math.max(1, Number.parseInt(current, 10) || 1))
                      return String(Math.min(MAX_PLAYERS, currentParsed + 1))
                    })
                  }
                  disabled={parsedPlayerCount >= MAX_PLAYERS}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-950 text-white disabled:opacity-40 dark:bg-white dark:text-zinc-950"
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
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
                    <Badge
                      variant={customer.membershipStatus === 'ACTIVE' ? 'success' : 'warning'}
                      size="sm"
                    >
                      {customer.membershipStatus === 'ACTIVE'
                        ? 'Còn hạn'
                        : customer.membershipStatus === 'EXPIRED'
                          ? 'Hết hạn'
                          : 'Chưa đóng'}
                    </Badge>
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
                        : 'Hết hạn — cần gia hạn trước khi chơi'}
                    </p>
                  </div>
                  <Badge variant={membershipActive ? 'success' : 'warning'}>
                    {membershipActive ? 'Còn hạn' : 'Hết hạn'}
                  </Badge>
                </div>
              </div>
            )}

            {memberNeedsRenewal && (
              <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-500/20 dark:bg-amber-500/10">
                <p className="text-sm text-zinc-700 dark:text-zinc-200">
                  Hội viên hết hạn. Vào tab <span className="font-semibold">Hội viên</span> để gia hạn trước khi check-in.
                </p>
                <Button
                  variant="inverse"
                  size="md"
                  fullWidth
                  icon={ShieldCheck}
                  onClick={() => {
                    onClose()
                    router.push('/customers')
                  }}
                >
                  Đến tab Hội viên
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
