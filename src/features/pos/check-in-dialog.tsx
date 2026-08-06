'use client'

import { useEffect, useState } from 'react'
import { Minus, Plus, Search, ShieldCheck, UserPlus, Users } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input, Label, Select } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { useToast } from '@/components/ui/toast'
import { apiJson, jsonRequest } from './api'
import { formatDay, money } from './format'
import { GroupBuilder } from './group-builder'
import type { Customer, Membership, MembershipPlan, PaymentMethod, SessionRow } from './types'

type CheckInMode = 'WALK_IN' | 'MEMBER'

interface PricingRuleOption {
  id: string
  name: string
  ratePerHour: number
  tiers: { minHours: number; ratePerHour: number }[]
}

export function CheckInDialog({  open,
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
  const [checkInStartTime, setCheckInStartTime] = useState('')

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
    // ── Khởi tạo giờ check-in mặc định = giờ hiện tại (HH:MM) ──
    const now = new Date()
    setCheckInStartTime(
      `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    )
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
    if (checkInStartTime) {
      const [h, m] = checkInStartTime.split(':').map(Number)
      const start = new Date()
      start.setHours(h, m, 0, 0)
      body.startTime = start.toISOString()
    }
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

        <div className="mt-3">
          <Label htmlFor="check-in-start-time">Giờ check-in</Label>
          <Input
            id="check-in-start-time"
            type="time"
            value={checkInStartTime}
            onChange={(e) => setCheckInStartTime(e.target.value)}
          />
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Mặc định là giờ hiện tại. Sửa nếu cần lùi hoặc tiến giờ check-in.
          </p>
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

