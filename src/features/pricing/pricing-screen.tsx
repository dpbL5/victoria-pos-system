'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Banknote,
  CalendarDays,
  Clock3,
  Edit3,
  Plus,
  Repeat2,
  Trash2,
  type LucideIcon,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { FilterButton } from '@/components/ui/filter-button'
import { Input, Label } from '@/components/ui/input'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Modal } from '@/components/ui/modal'
import { NoticeCard } from '@/components/ui/notice-card'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/components/ui/toast'
import { useApi } from '@/hooks/use-api'
import { apiJson, jsonRequest } from '@/lib/api'
import { usePageRefresh } from '@/components/layout/page-refresh-context'
import { formatDay, money } from '@/features/pos/format'
import type { UserSession } from '@/features/pos/types'
import { toInputDate } from '@/lib/shared/utils'

type DayType = 'WEEKDAY' | 'WEEKEND'
type StatusFilter = 'ALL' | 'ACTIVE' | 'FUTURE' | 'EXPIRED'
type DayFilter = 'ALL' | string

interface PricingRule {
  id: string
  name: string
  daysOfWeek?: number[]
  hourFrom: number
  hourTo: number | null
  ratePerHour: number | string
  dayType: DayType
  effectiveFrom: string
  effectiveTo: string | null
  createdAt: string
  tiers?: { id: string; ruleId: string; minHours: number; ratePerHour: number | string }[]
}

interface PricingTierFormState {
  minHours: string
  ratePerHour: string
}

interface PricingFormState {
  name: string
  daysOfWeek: number[]
  hourFrom: string
  hourTo: string
  ratePerHour: string
  effectiveFrom: string
  effectiveTo: string
  tiers: PricingTierFormState[]
}

const weekDays = [
  { value: 1, short: 'T2', label: 'Thứ 2' },
  { value: 2, short: 'T3', label: 'Thứ 3' },
  { value: 3, short: 'T4', label: 'Thứ 4' },
  { value: 4, short: 'T5', label: 'Thứ 5' },
  { value: 5, short: 'T6', label: 'Thứ 6' },
  { value: 6, short: 'T7', label: 'Thứ 7' },
  { value: 0, short: 'CN', label: 'Chủ nhật' },
]

const weekdayDays = [1, 2, 3, 4, 5]
const weekendDays = [6, 0]
const allWeekDays = [1, 2, 3, 4, 5, 6, 0]

const emptyForm: PricingFormState = {
  name: '',
  daysOfWeek: weekdayDays,
  hourFrom: '0',
  hourTo: '24',
  ratePerHour: '150000',
  effectiveFrom: toInputDate(new Date()),
  effectiveTo: '',
  tiers: [],
}

export function PricingScreen() {
  const { success: notifySuccess, error: notifyError } = useToast()
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
  const [dayFilter, setDayFilter] = useState<DayFilter>('ALL')
  const [dialogMode, setDialogMode] = useState<'create' | 'edit' | null>(null)
  const [editingRule, setEditingRule] = useState<PricingRule | null>(null)
  const [deleteRule, setDeleteRule] = useState<PricingRule | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const { data: pricingData, isLoading: pricingLoading, mutate } = useApi<PricingRule[]>('/api/pricing', { dedupingInterval: 300_000 })
  const { data: userData, isLoading: userLoading } = useApi<UserSession>('/api/auth/me', { dedupingInterval: 600_000 })

  const { registerRefresh } = usePageRefresh()

  useEffect(() => {
    return registerRefresh(() => void mutate())
  }, [registerRefresh, mutate])

  const rules: PricingRule[] = pricingData?.data ?? []
  const error = !pricingData?.success ? (pricingData?.error as string ?? '') : ''
  const loading = pricingLoading || userLoading
  const user = userData?.data ?? null

  const stats = useMemo(() => {
    const active = rules.filter((rule) => getRuleStatus(rule) === 'ACTIVE').length
    const future = rules.filter((rule) => getRuleStatus(rule) === 'FUTURE').length
    const expired = rules.filter((rule) => getRuleStatus(rule) === 'EXPIRED').length
    const coveredDays = new Set(rules.flatMap((rule) => getRuleDays(rule))).size

    return {
      total: rules.length,
      active,
      future,
      expired,
      coveredDays,
    }
  }, [rules])

  const filteredRules = useMemo(
    () => rules.filter((rule) => {
      const matchesStatus = statusFilter === 'ALL' || getRuleStatus(rule) === statusFilter
      const matchesDay = dayFilter === 'ALL' || getRuleDays(rule).includes(Number(dayFilter))
      return matchesStatus && matchesDay
    }),
    [rules, statusFilter, dayFilter]
  )

  const openCreate = () => {
    setEditingRule(null)
    setDialogMode('create')
  }

  const openEdit = (rule: PricingRule) => {
    setEditingRule(rule)
    setDialogMode('edit')
  }

  const handleSaved = async (message: string) => {
    notifySuccess(message)
    setDialogMode(null)
    setEditingRule(null)
    await mutate()
  }

  const confirmDelete = async () => {
    if (!deleteRule) return

    setSubmitting(true)
    try {
      const data = await apiJson(`/api/pricing/${deleteRule.id}`, { method: 'DELETE' })
      if (!data.success) {
        notifyError(data.error || 'Không xóa được quy tắc')
        return
      }
      notifySuccess('Đã xóa quy tắc bảng giá')
      setDeleteRule(null)
      await mutate()
    } catch {
      notifyError('Lỗi kết nối máy chủ')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <PricingSkeleton />
  }

  const isAdmin = user?.role === 'ADMIN'

  return (
    <div className="min-h-full bg-zinc-50 px-4 py-4 dark:bg-zinc-950 md:px-6 md:py-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <header className="hidden items-center justify-between gap-3 md:flex">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-zinc-950 dark:text-white">
              Bảng giá
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

        {!isAdmin ? (
          <AccessDenied />
        ) : (
          <>
            <NoticeCard
              tone={stats.active > 0 ? 'success' : 'warning'}
              title={stats.active > 0 ? 'Có giá đang hiệu lực' : 'Chưa có giá hiệu lực'}
              description={
                stats.active > 0
                  ? `${stats.active} quy tắc đang nằm trong thời hạn áp dụng.`
                  : 'Khách vãng lai sẽ bị khóa check-in nếu thời điểm hiện tại không có quy tắc giá phù hợp.'
              }
            />

            <section className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <PricingStat label="Tất cả" value={stats.total} active={statusFilter === 'ALL'} onClick={() => setStatusFilter('ALL')} />
              <PricingStat label="Hiệu lực" value={stats.active} active={statusFilter === 'ACTIVE'} onClick={() => setStatusFilter('ACTIVE')} />
              <PricingStat label="Sắp tới" value={stats.future} active={statusFilter === 'FUTURE'} onClick={() => setStatusFilter('FUTURE')} />
              <PricingStat label="Hết hạn" value={stats.expired} active={statusFilter === 'EXPIRED'} onClick={() => setStatusFilter('EXPIRED')} warning={stats.expired > 0} />
            </section>

            <section className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex gap-2 overflow-x-auto pb-1">
                <FilterButton active={dayFilter === 'ALL'} onClick={() => setDayFilter('ALL')}>Tất cả ngày</FilterButton>
                {weekDays.map((day) => (
                  <FilterButton
                    key={day.value}
                    active={dayFilter === String(day.value)}
                    onClick={() => setDayFilter(String(day.value))}
                  >
                    {day.short}
                  </FilterButton>
                ))}
              </div>
            </section>

            <Button
              variant="inverse"
              size="lg"
              fullWidth
              icon={Plus}
              onClick={openCreate}
            >
              Thêm quy tắc bảng giá
            </Button>

            <section className="rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
                <div>
                  <h2 className="text-sm font-semibold text-zinc-950 dark:text-white">
                    Quy tắc giá giờ chơi
                  </h2>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    {filteredRules.length} quy tắc · phủ {stats.coveredDays}/7 ngày trong tuần
                  </p>
                </div>
                <Badge variant={stats.active > 0 ? 'success' : 'warning'}>
                  {stats.active > 0 ? 'Sẵn sàng' : 'Thiếu giá'}
                </Badge>
              </div>

              {filteredRules.length === 0 ? (
                <EmptyState
                  icon={Banknote}
                  message="Chưa có quy tắc phù hợp"
                  description="Thử đổi bộ lọc hoặc thêm quy tắc bảng giá mới."
                />
              ) : (
                <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {filteredRules.map((rule) => (
                    <PricingRuleCard
                      key={rule.id}
                      rule={rule}
                      onEdit={() => openEdit(rule)}
                      onDelete={() => setDeleteRule(rule)}
                    />
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>

      <PricingRuleDialog
        mode={dialogMode}
        rule={editingRule}
        submitting={submitting}
        setSubmitting={setSubmitting}
        onClose={() => {
          setDialogMode(null)
          setEditingRule(null)
        }}
        onSaved={handleSaved}
      />

      <ConfirmDialog
        open={!!deleteRule}
        onClose={() => setDeleteRule(null)}
        title="Xóa quy tắc bảng giá"
        description={deleteRule ? `Quy tắc "${deleteRule.name}" sẽ không còn được dùng cho lượt check-in mới.` : undefined}
        body={
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Phiên đã check-in vẫn giữ giá đã snapshot. Thay đổi này chỉ ảnh hưởng các lượt check-in sau.
          </p>
        }
        confirmLabel="Xóa"
        submitting={submitting}
        onConfirm={confirmDelete}
      />
    </div>
  )
}

function PricingSkeleton() {
  return (
    <div className="space-y-4 p-4 md:p-6">
      <Skeleton className="h-10 w-36" />
      <Skeleton className="h-16 w-full" />
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </div>
      <Skeleton className="h-80 w-full" />
    </div>
  )
}

function PricingStat({
  label,
  value,
  active,
  warning,
  onClick,
}: {
  label: string
  value: number
  active: boolean
  warning?: boolean
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
      <p className={`mt-1 text-xl font-bold tabular-nums ${
        warning ? 'text-amber-600 dark:text-amber-300' : 'text-zinc-950 dark:text-white'
      }`}
      >
        {value}
      </p>
    </button>
  )
}

function PricingRuleCard({
  rule,
  onEdit,
  onDelete,
}: {
  rule: PricingRule
  onEdit: () => void
  onDelete: () => void
}) {
  const status = getRuleStatus(rule)
  const days = getRuleDays(rule)

  return (
    <div className="px-4 py-3">
      <div className="grid grid-cols-[1fr_auto] gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold text-zinc-950 dark:text-white">
              {rule.name}
            </p>
            <StatusBadge status={status} />
          </div>
          <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            {formatWeeklyDays(days)} · {formatHourRange(rule.hourFrom, rule.hourTo)}
          </div>
        </div>
        <p className="self-start text-sm font-bold tabular-nums text-zinc-950 dark:text-white">
          {money(rule.ratePerHour)}
        </p>
      </div>

      <div className="mt-3">
        <WeeklyStrip days={days} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3">
        <MiniInfo Icon={Clock3} label="Khung giờ" value={formatHourRange(rule.hourFrom, rule.hourTo)} />
        <MiniInfo Icon={Repeat2} label="Lặp lại" value={formatWeeklyDays(days)} />
        <MiniInfo Icon={CalendarDays} label="Hiệu lực" value={formatEffectiveRange(rule)} />
      </div>

      {rule.tiers && rule.tiers.length > 0 && (
        <div className="mt-3 rounded-lg bg-zinc-50 p-3 dark:bg-zinc-950">
          <p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">Giá luỹ tiến theo giờ chơi</p>
          <div className="mt-1 space-y-1">
            <p className="text-xs text-zinc-700 dark:text-zinc-300">&lt;{rule.tiers[0]!.minHours}h: <span className="font-semibold tabular-nums">{money(rule.ratePerHour)}</span>/giờ</p>
            {rule.tiers.map((tier, idx) => {
              const nextMin = rule.tiers![idx + 1]?.minHours
              const range = nextMin ? `${tier.minHours}-${nextMin}h` : `≥${tier.minHours}h`
              return (
                <p key={tier.id} className="text-xs text-zinc-700 dark:text-zinc-300">
                  {range}: <span className="font-semibold tabular-nums">{money(tier.ratePerHour)}</span>/giờ
                </p>
              )
            })}
          </div>
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <Button variant="secondary" size="sm" icon={Edit3} onClick={onEdit}>
          Sửa
        </Button>
        <Button variant="outline-danger" size="sm" icon={Trash2} onClick={onDelete}>
          Xóa
        </Button>
      </div>
    </div>
  )
}

function MiniInfo({
  Icon,
  label,
  value,
}: {
  Icon: LucideIcon
  label: string
  value: string
}) {
  return (
    <div className="rounded-lg bg-zinc-50 px-3 py-2 dark:bg-zinc-950">
      <p className="flex items-center gap-1 text-[11px] text-zinc-500 dark:text-zinc-400">
        <Icon size={12} />
        {label}
      </p>
      <p className="mt-1 text-xs font-semibold text-zinc-950 dark:text-white">{value}</p>
    </div>
  )
}

function PricingRuleDialog({
  mode,
  rule,
  submitting,
  setSubmitting,
  onClose,
  onSaved,
}: {
  mode: 'create' | 'edit' | null
  rule: PricingRule | null
  submitting: boolean
  setSubmitting: (value: boolean) => void
  onClose: () => void
  onSaved: (message: string) => Promise<void>
}) {
  const { error: notifyError } = useToast()
  const [form, setForm] = useState<PricingFormState>(emptyForm)

  useEffect(() => {
    if (!mode) return

    if (mode === 'edit' && rule) {
      /* eslint-disable react-hooks/set-state-in-effect */
      setForm({
        name: rule.name,
        daysOfWeek: getRuleDays(rule),
        hourFrom: String(rule.hourFrom),
        hourTo: rule.hourTo === null ? '' : String(rule.hourTo),
        ratePerHour: String(Number(rule.ratePerHour)),
        effectiveFrom: toDateInputValue(rule.effectiveFrom),
        effectiveTo: toDateInputValue(rule.effectiveTo),
        tiers: (rule.tiers ?? []).map((t) => ({
          minHours: String(t.minHours),
          ratePerHour: String(Number(t.ratePerHour)),
        })),
      })
      /* eslint-enable react-hooks/set-state-in-effect */
      return
    }

    setForm(emptyForm)
  }, [mode, rule])

  const submit = async () => {
    const payload = buildPricingPayload(form)
    if ('error' in payload) {
      notifyError(payload.error)
      return
    }

    setSubmitting(true)
    try {
      const url = mode === 'edit' && rule ? `/api/pricing/${rule.id}` : '/api/pricing'
      const init = mode === 'edit'
        ? {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload.data),
          }
        : jsonRequest(payload.data)
      const data = await apiJson<PricingRule>(url, init)
      if (!data.success) {
        notifyError(data.error || 'Không lưu được bảng giá')
        return
      }

      const hasOverlaps = data.warnings && data.warnings.length > 0
      const message = mode === 'edit' ? 'Đã cập nhật bảng giá' : 'Đã tạo bảng giá'
      const finalMessage = hasOverlaps
        ? `${message}. Lưu ý: có quy tắc bị chồng lấn khung giờ.`
        : message

      await onSaved(finalMessage)
    } catch {
      notifyError('Lỗi kết nối máy chủ')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={!!mode}
      onClose={onClose}
      title={mode === 'edit' ? 'Sửa quy tắc bảng giá' : 'Thêm quy tắc bảng giá'}
      description="Chọn các thứ trong tuần để quy tắc tự lặp lại hằng tuần."
      size="lg"
      footer={
        <Button variant="inverse" size="lg" fullWidth disabled={submitting} onClick={submit}>
          {submitting ? 'Đang lưu...' : 'Lưu bảng giá'}
        </Button>
      }
    >
      <PricingForm form={form} setForm={setForm} />
    </Modal>
  )
}

function PricingForm({
  form,
  setForm,
}: {
  form: PricingFormState
  setForm: (form: PricingFormState) => void
}) {
  return (
    <div className="space-y-3">
      <div>
        <Label htmlFor="pricing-name" required>Tên quy tắc</Label>
        <Input
          id="pricing-name"
          value={form.name}
          onChange={(event) => setForm({ ...form, name: event.target.value })}
          placeholder="Ví dụ: Tối T2-T6"
        />
      </div>

      <WeeklyDaySelector
        value={form.daysOfWeek}
        onChange={(daysOfWeek) => setForm({ ...form, daysOfWeek })}
      />

      <div>
        <Label htmlFor="pricing-rate" required>Giá mỗi giờ</Label>
        <Input
          id="pricing-rate"
          type="number"
          min="1000"
          step="1000"
          inputMode="numeric"
          value={form.ratePerHour}
          onChange={(event) => setForm({ ...form, ratePerHour: event.target.value })}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="pricing-hour-from" required>Từ giờ</Label>
          <Input
            id="pricing-hour-from"
            type="number"
            min="0"
            max="23"
            inputMode="numeric"
            value={form.hourFrom}
            onChange={(event) => setForm({ ...form, hourFrom: event.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="pricing-hour-to">Đến giờ</Label>
          <Input
            id="pricing-hour-to"
            type="number"
            min="1"
            max="24"
            inputMode="numeric"
            value={form.hourTo}
            onChange={(event) => setForm({ ...form, hourTo: event.target.value })}
            placeholder="24"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="pricing-effective-from" required>Hiệu lực từ</Label>
          <Input
            id="pricing-effective-from"
            type="date"
            value={form.effectiveFrom}
            onChange={(event) => setForm({ ...form, effectiveFrom: event.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="pricing-effective-to">Hiệu lực đến</Label>
          <Input
            id="pricing-effective-to"
            type="date"
            value={form.effectiveTo}
            onChange={(event) => setForm({ ...form, effectiveTo: event.target.value })}
          />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <Label>Giá theo giờ chơi (tuỳ chọn)</Label>
          <Button
            variant="secondary"
            size="xs"
            onClick={() => setForm({
              ...form,
              tiers: [...(form.tiers ?? []), { minHours: '2', ratePerHour: String(Math.round(Number(form.ratePerHour) * 0.7)) }],
            })}
          >
            + Thêm mức giá
          </Button>
        </div>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Giá áp dụng luỹ tiến theo giờ chơi. Giá cơ bản cho giờ đầu, các mức tiếp theo cho giờ sau khi đạt mốc.
        </p>

        {(form.tiers ?? []).length > 0 && (
          <div className="mt-2 space-y-2">
            {form.tiers.map((tier, idx) => (
              <div key={idx} className="flex items-end gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-900">
                <div className="flex-1">
                  <Label>Chơi từ</Label>
                  <div className="relative">
                    <Input
                      type="number"
                      min="1"
                      step="1"
                      inputMode="numeric"
                      value={tier.minHours}
                      onChange={(event) => {
                        const newTiers = [...(form.tiers ?? [])]
                        newTiers[idx] = { ...newTiers[idx]!, minHours: event.target.value }
                        setForm({ ...form, tiers: newTiers })
                      }}
                    />
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-medium text-zinc-500 dark:text-zinc-400">
                      giờ
                    </span>
                  </div>
                </div>
                <div className="flex-2">
                  <Label>Giá/giờ</Label>
                  <Input
                    type="number"
                    min="1000"
                    step="1000"
                    inputMode="numeric"
                    value={tier.ratePerHour}
                    onChange={(event) => {
                      const newTiers = [...(form.tiers ?? [])]
                      newTiers[idx] = { ...newTiers[idx]!, ratePerHour: event.target.value }
                      setForm({ ...form, tiers: newTiers })
                    }}
                  />
                </div>
                <Button
                  variant="secondary"
                  size="xs"
                  onClick={() => {
                    const newTiers = [...(form.tiers ?? [])]
                    newTiers.splice(idx, 1)
                    setForm({ ...form, tiers: newTiers })
                  }}
                  title="Xoá mức giá này"
                >
                  ✕
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-700 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300">
        Khung giờ dùng dạng từ giờ bắt đầu đến trước giờ kết thúc. Ví dụ 17-21 áp dụng từ 17:00 đến trước 21:00.
      </div>
    </div>
  )
}

function WeeklyDaySelector({
  value,
  onChange,
}: {
  value: number[]
  onChange: (daysOfWeek: number[]) => void
}) {
  const selectedDays = normalizeDays(value)

  const toggleDay = (day: number) => {
    const nextDays = selectedDays.includes(day)
      ? selectedDays.filter((item) => item !== day)
      : [...selectedDays, day]
    onChange(normalizeDays(nextDays))
  }

  return (
    <div>
      <Label required>Ngày lặp hằng tuần</Label>
      <div className="grid grid-cols-7 gap-1.5">
        {weekDays.map((day) => {
          const active = selectedDays.includes(day.value)
          return (
            <button
              key={day.value}
              type="button"
              aria-pressed={active}
              title={day.label}
              onClick={() => toggleDay(day.value)}
              className={`flex aspect-square min-h-10 items-center justify-center rounded-lg border text-xs font-semibold transition-colors ${
                active
                  ? 'border-blue-600 bg-blue-600 text-white shadow-sm dark:border-blue-400 dark:bg-blue-500'
                  : 'border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
              }`}
            >
              {day.short}
            </button>
          )
        })}
      </div>
      <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
        <Button variant="secondary" size="xs" onClick={() => onChange(weekdayDays)}>
          T2-T6
        </Button>
        <Button variant="secondary" size="xs" onClick={() => onChange(weekendDays)}>
          Cuối tuần
        </Button>
        <Button variant="secondary" size="xs" onClick={() => onChange(allWeekDays)}>
          Cả tuần
        </Button>
      </div>
    </div>
  )
}

function WeeklyStrip({ days }: { days: number[] }) {
  const selectedDays = normalizeDays(days)

  return (
    <div className="grid grid-cols-7 gap-1">
      {weekDays.map((day) => {
        const active = selectedDays.includes(day.value)
        return (
          <span
            key={day.value}
            className={`flex h-6 items-center justify-center rounded-md border text-[10px] font-semibold ${
              active
                ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300'
                : 'border-zinc-100 bg-zinc-50 text-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-600'
            }`}
          >
            {day.short}
          </span>
        )
      })}
    </div>
  )
}

function AccessDenied() {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-6 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-100 text-zinc-400 dark:bg-zinc-800">
        <Banknote size={24} />
      </div>
      <h2 className="mt-4 text-sm font-semibold text-zinc-950 dark:text-white">
        Chỉ quản trị viên được sửa bảng giá
      </h2>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        Nhân viên vẫn dùng bảng giá hiện hành trong màn check-in và checkout.
      </p>
    </section>
  )
}

function StatusBadge({ status }: { status: StatusFilter }) {
  if (status === 'ACTIVE') return <Badge variant="success" size="sm">Hiệu lực</Badge>
  if (status === 'FUTURE') return <Badge variant="blue" size="sm">Sắp tới</Badge>
  if (status === 'EXPIRED') return <Badge variant="warning" size="sm">Hết hạn</Badge>
  return <Badge variant="default" size="sm">Khác</Badge>
}

function getRuleStatus(rule: PricingRule): StatusFilter {
  const now = new Date()
  const from = new Date(rule.effectiveFrom)
  const to = rule.effectiveTo ? new Date(rule.effectiveTo) : null
  if (from > now) return 'FUTURE'
  if (to && to < now) return 'EXPIRED'
  return 'ACTIVE'
}

function buildPricingPayload(form: PricingFormState):
  | { data: unknown }
  | { error: string } {
  const name = form.name.trim()
  if (!name) return { error: 'Nhập tên quy tắc bảng giá' }

  const daysOfWeek = normalizeDays(form.daysOfWeek)
  const hourFrom = Number(form.hourFrom)
  const hourTo = form.hourTo.trim() ? Number(form.hourTo) : null
  const ratePerHour = Number(form.ratePerHour)

  if (daysOfWeek.length === 0) {
    return { error: 'Chọn ít nhất một ngày lặp trong tuần' }
  }
  if (!Number.isInteger(hourFrom) || hourFrom < 0 || hourFrom > 23) {
    return { error: 'Giờ bắt đầu phải từ 0 đến 23' }
  }
  if (hourTo !== null && (!Number.isInteger(hourTo) || hourTo < 1 || hourTo > 24)) {
    return { error: 'Giờ kết thúc phải từ 1 đến 24' }
  }
  if (hourTo !== null && hourTo <= hourFrom) {
    return { error: 'Giờ kết thúc phải sau giờ bắt đầu' }
  }
  if (!Number.isFinite(ratePerHour) || ratePerHour <= 0) {
    return { error: 'Giá theo giờ phải lớn hơn 0' }
  }
  if (!form.effectiveFrom) {
    return { error: 'Chọn ngày bắt đầu hiệu lực' }
  }
  if (form.effectiveTo && new Date(form.effectiveTo) < new Date(form.effectiveFrom)) {
    return { error: 'Ngày hết hiệu lực phải sau ngày bắt đầu' }
  }

  const tiers = (form.tiers ?? [])
    .filter((t) => t.minHours.trim() && t.ratePerHour.trim())
    .map((t) => {
      const minHours = Number(t.minHours)
      const tRate = Number(t.ratePerHour)
      return { minHours, ratePerHour: tRate }
    })

  const uniqueMinHours = new Set(tiers.map((t) => t.minHours))
  if (uniqueMinHours.size !== tiers.length) {
    return { error: 'Số giờ tối thiểu trong các mức giá không được trùng nhau' }
  }

  for (const t of tiers) {
    if (!Number.isInteger(t.minHours) || t.minHours < 1) {
      return { error: 'Số giờ tối thiểu cho mức giá phải từ 1' }
    }
    if (!Number.isFinite(t.ratePerHour) || t.ratePerHour <= 0) {
      return { error: 'Giá theo giờ cho mức giá phải lớn hơn 0' }
    }
  }

  return {
    data: {
      name,
      daysOfWeek,
      hourFrom,
      hourTo,
      ratePerHour,
      dayType: deriveDayType(daysOfWeek),
      effectiveFrom: form.effectiveFrom,
      effectiveTo: form.effectiveTo || null,
      tiers,
    },
  }
}

function getRuleDays(rule: PricingRule): number[] {
  const days = normalizeDays(rule.daysOfWeek ?? [])
  if (days.length > 0) return days
  return rule.dayType === 'WEEKEND' ? weekendDays : weekdayDays
}

function normalizeDays(days: number[]): number[] {
  return allWeekDays.filter((day) => days.includes(day))
}

function deriveDayType(days: number[]): DayType {
  return normalizeDays(days).every((day) => day === 0 || day === 6) ? 'WEEKEND' : 'WEEKDAY'
}

function formatWeeklyDays(days: number[]): string {
  const normalizedDays = normalizeDays(days)
  if (sameDays(normalizedDays, allWeekDays)) return 'Cả tuần'
  if (sameDays(normalizedDays, weekdayDays)) return 'Thứ 2 - Thứ 6'
  if (sameDays(normalizedDays, weekendDays)) return 'Cuối tuần'
  return weekDays
    .filter((day) => normalizedDays.includes(day.value))
    .map((day) => day.short)
    .join(', ')
}

function sameDays(left: number[], right: number[]): boolean {
  const normalizedLeft = normalizeDays(left)
  const normalizedRight = normalizeDays(right)
  return normalizedLeft.length === normalizedRight.length
    && normalizedLeft.every((day, index) => day === normalizedRight[index])
}

function formatHourRange(hourFrom: number, hourTo: number | null): string {
  return `${hourFrom}:00 - ${hourTo ?? 24}:00`
}

function formatEffectiveRange(rule: PricingRule): string {
  return `${formatDay(rule.effectiveFrom)}${rule.effectiveTo ? ` - ${formatDay(rule.effectiveTo)}` : ' trở đi'}`
}

function toDateInputValue(value: string | null): string {
  if (!value) return ''
  return value.split('T')[0]
}
