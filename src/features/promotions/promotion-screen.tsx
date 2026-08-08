'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Banknote,
  CalendarDays,
  Clock3,
  Edit3,
  Pause,
  Percent,
  Play,
  Plus,
  RefreshCw,
  Tag,
  Ticket,
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
import { apiJson, jsonRequest } from '@/features/pos/api'
import type { UserSession } from '@/features/pos/types'
import { formatVND, toInputDate } from '@/lib/utils'
import type { PromotionDiscountType, PromotionRule } from '@/types'

type StatusFilter = 'ALL' | 'ACTIVE' | 'FUTURE' | 'INACTIVE'
type TypeFilter = 'ALL' | 'FIXED_AMOUNT' | 'PERCENT' | 'FIXED_PER_HOUR' | 'PERCENT_PLAY_TIME'
type PromotionStatus = 'ACTIVE' | 'FUTURE' | 'EXPIRED' | 'PAUSED'

interface PromotionFormState {
  name: string
  discountType: PromotionDiscountType
  discountValue: string
  daysOfWeek: number[]
  hourFrom: string
  hourTo: string
  effectiveFrom: string
  effectiveTo: string
  isActive: boolean
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

const emptyForm: PromotionFormState = {
  name: '',
  discountType: 'FIXED_AMOUNT',
  discountValue: '50000',
  daysOfWeek: allWeekDays,
  hourFrom: '0',
  hourTo: '24',
  effectiveFrom: toInputDate(new Date()),
  effectiveTo: '',
  isActive: true,
}

export function PromotionScreen() {
  const { success: notifySuccess, error: notifyError } = useToast()
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('ALL')
  const [dialogMode, setDialogMode] = useState<'create' | 'edit' | null>(null)
  const [editingRule, setEditingRule] = useState<PromotionRule | null>(null)
  const [deactivateRule, setDeactivateRule] = useState<PromotionRule | null>(null)
  const [removeRule, setRemoveRule] = useState<PromotionRule | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const { data: promoData, isLoading: promoLoading, mutate } = useApi<PromotionRule[]>('/api/promotions', { dedupingInterval: 300_000 })
  const { data: userData, isLoading: userLoading } = useApi<UserSession>('/api/auth/me', { dedupingInterval: 600_000 })

  const rules: PromotionRule[] = promoData?.data ?? []
  const error = !promoData?.success ? (promoData?.error as string ?? '') : ''
  const loading = promoLoading || userLoading
  const user = userData?.data ?? null

  const stats = useMemo(() => ({
    total: rules.length,
    active: rules.filter((rule) => getRuleStatus(rule) === 'ACTIVE').length,
    future: rules.filter((rule) => getRuleStatus(rule) === 'FUTURE').length,
    inactive: rules.filter((rule) => {
      const status = getRuleStatus(rule)
      return status === 'EXPIRED' || status === 'PAUSED'
    }).length,
  }), [rules])

  const filteredRules = useMemo(() => rules.filter((rule) => {
    const status = getRuleStatus(rule)
    const matchesStatus = statusFilter === 'ALL'
      || (statusFilter === 'INACTIVE'
        ? status === 'EXPIRED' || status === 'PAUSED'
        : status === statusFilter)
    const matchesType = typeFilter === 'ALL' || rule.discountType === typeFilter
    return matchesStatus && matchesType
  }), [rules, statusFilter, typeFilter])

  const handleSaved = async (message: string) => {
    notifySuccess(message)
    setDialogMode(null)
    setEditingRule(null)
    await mutate()
  }

  const confirmDeactivate = async () => {
    if (!deactivateRule) return

    setSubmitting(true)
    try {
      const data = await apiJson(`/api/promotions/${deactivateRule.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: false }),
      })
      if (!data.success) {
        notifyError(data.error || 'Không tạm dừng được khuyến mại')
        return
      }
      notifySuccess('Đã tạm dừng khuyến mại')
      setDeactivateRule(null)
      await mutate()
    } catch {
      notifyError('Lỗi kết nối máy chủ')
    } finally {
      setSubmitting(false)
    }
  }

  const confirmRemove = async () => {
    if (!removeRule) return

    setSubmitting(true)
    try {
      const data = await apiJson(`/api/promotions/${removeRule.id}`, { method: 'DELETE' })
      if (!data.success) {
        notifyError(data.error || 'Không xoá được khuyến mại')
        return
      }
      notifySuccess('Đã xoá khuyến mại')
      setRemoveRule(null)
      await mutate()
    } catch {
      notifyError('Lỗi kết nối máy chủ')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <PromotionSkeleton />

  const isAdmin = user?.role === 'ADMIN'

  return (
    <div className="min-h-full bg-zinc-50 px-4 py-4 dark:bg-zinc-950 md:px-6 md:py-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <header className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Thiết lập vận hành
            </p>
            <h1 className="mt-1 text-2xl font-bold text-zinc-950 dark:text-white">
              Khuyến mại giờ chơi
            </h1>
          </div>
          <Button
            variant="secondary"
            size="sm"
            icon={RefreshCw}
            onClick={() => void mutate()}
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

        {!isAdmin ? <AccessDenied /> : (
          <>
            <NoticeCard
              tone={stats.active > 0 ? 'success' : 'info'}
              title={stats.active > 0 ? 'Khuyến mại đang sẵn sàng' : 'Chưa có khuyến mại đang áp dụng'}
              description={
                stats.active > 0
                  ? `${stats.active} quy tắc đang trong thời hạn hiệu lực cho khách vãng lai.`
                  : 'Khuyến mại là tùy chọn; khách vãng lai vẫn dùng giá giờ chơi hiện hành.'
              }
            />

            <section className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <PromotionStat label="Tất cả" value={stats.total} active={statusFilter === 'ALL'} onClick={() => setStatusFilter('ALL')} />
              <PromotionStat label="Hiệu lực" value={stats.active} active={statusFilter === 'ACTIVE'} onClick={() => setStatusFilter('ACTIVE')} />
              <PromotionStat label="Sắp tới" value={stats.future} active={statusFilter === 'FUTURE'} onClick={() => setStatusFilter('FUTURE')} />
              <PromotionStat label="Tạm dừng / hết" value={stats.inactive} active={statusFilter === 'INACTIVE'} onClick={() => setStatusFilter('INACTIVE')} warning={stats.inactive > 0} />
            </section>

            <section className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex gap-2 overflow-x-auto pb-1">
                <FilterButton active={typeFilter === 'ALL'} onClick={() => setTypeFilter('ALL')}>
                  Tất cả loại giảm
                </FilterButton>
                <FilterButton active={typeFilter === 'FIXED_AMOUNT'} onClick={() => setTypeFilter('FIXED_AMOUNT')}>
                  Giảm tiền cố định
                </FilterButton>
                <FilterButton active={typeFilter === 'PERCENT'} onClick={() => setTypeFilter('PERCENT')}>
                  Giảm phần trăm
                </FilterButton>
              </div>
            </section>

            <Button
              variant="inverse"
              size="lg"
              fullWidth
              icon={Plus}
              onClick={() => {
                setEditingRule(null)
                setDialogMode('create')
              }}
            >
              Thêm khuyến mại
            </Button>

            <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
                <div>
                  <h2 className="text-sm font-semibold text-zinc-950 dark:text-white">Quy tắc khuyến mại</h2>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Mỗi thời điểm chỉ áp dụng một quy tắc, không cộng dồn.
                  </p>
                </div>
                <Badge variant={stats.active > 0 ? 'success' : 'default'}>{filteredRules.length}</Badge>
              </div>

              {filteredRules.length === 0 ? (
                <EmptyState
                  icon={Ticket}
                  message="Chưa có khuyến mại phù hợp"
                  description="Thử đổi bộ lọc hoặc tạo một chương trình giảm giá giờ chơi mới."
                />
              ) : (
                <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {filteredRules.map((rule) => (
                    <PromotionCard
                      key={rule.id}
                      rule={rule}
                      onEdit={() => {
                        setEditingRule(rule)
                        setDialogMode('edit')
                      }}
                      onDeactivate={() => setDeactivateRule(rule)}
                      onRemove={() => setRemoveRule(rule)}
                    />
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>

      <PromotionDialog
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
        open={!!deactivateRule}
        onClose={() => setDeactivateRule(null)}
        title="Tạm dừng khuyến mại"
        description={deactivateRule ? `Khuyến mại "${deactivateRule.name}" sẽ không còn hiển thị để chọn khi thu tiền.` : undefined}
        body={
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Cấu hình được giữ lại để có thể bật lại sau này. Lượt đã check-in vẫn giữ thông tin khuyến mại đã được snapshot.
          </p>
        }
        confirmLabel="Tạm dừng"
        submitting={submitting}
        onConfirm={confirmDeactivate}
      />

      <ConfirmDialog
        open={!!removeRule}
        onClose={() => setRemoveRule(null)}
        title="Xoá khuyến mại"
        description={removeRule ? `Khuyến mại "${removeRule.name}" sẽ bị xoá vĩnh viễn.` : undefined}
        body={
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Lượt đã check-in vẫn giữ thông tin khuyến mại đã snapshot. Hành động này không thể hoàn tác.
          </p>
        }
        confirmLabel="Xoá"
        submitting={submitting}
        onConfirm={confirmRemove}
      />
    </div>
  )
}

function PromotionSkeleton() {
  return (
    <div className="space-y-4 p-4 md:p-6">
      <Skeleton className="h-10 w-52" />
      <Skeleton className="h-24 w-full" />
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {[0, 1, 2, 3].map((item) => <Skeleton key={item} className="h-20" />)}
      </div>
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-72 w-full" />
    </div>
  )
}

function PromotionStat({
  label,
  value,
  active,
  warning = false,
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
          ? 'border-blue-500 bg-blue-600 text-white shadow-blue-500/20'
          : 'border-zinc-200 bg-white text-zinc-950 hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:text-white dark:hover:border-zinc-700'
      }`}
    >
      <p className={`text-[11px] font-medium ${active ? 'text-blue-100' : 'text-zinc-500 dark:text-zinc-400'}`}>{label}</p>
      <p className={`mt-1 text-xl font-bold tabular-nums ${!active && warning ? 'text-amber-600 dark:text-amber-300' : ''}`}>{value}</p>
    </button>
  )
}

function PromotionCard({
  rule,
  onEdit,
  onDeactivate,
  onRemove,
}: {
  rule: PromotionRule
  onEdit: () => void
  onDeactivate: () => void
  onRemove: () => void
}) {
  const status = getRuleStatus(rule)
  const isPercent = rule.discountType === 'PERCENT' || rule.discountType === 'PERCENT_PLAY_TIME'
  const isFixedAmount = rule.discountType === 'FIXED_AMOUNT'

  return (
    <div className="grid grid-cols-[5px_1fr]">
      <div className={isPercent ? 'bg-violet-500' : isFixedAmount ? 'bg-emerald-500' : 'bg-amber-500'} />
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-sm font-semibold text-zinc-950 dark:text-white">{rule.name}</p>
              <StatusBadge status={status} />
            </div>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              {formatWeeklyDays(rule.daysOfWeek)} · {formatHourRange(rule.hourFrom, rule.hourTo)}
            </p>
          </div>
          <div className={`flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-bold tabular-nums ${
            isPercent
              ? 'bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300'
              : isFixedAmount
                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'
                : 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300'
          }`}>
            {isPercent ? <Percent size={14} /> : isFixedAmount ? <Banknote size={14} /> : <Ticket size={14} />}
            {formatPromotionValue(rule)}
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3">
          <MiniInfo Icon={Clock3} label="Khung giờ" value={formatHourRange(rule.hourFrom, rule.hourTo)} />
          <MiniInfo Icon={CalendarDays} label="Lặp lại" value={formatWeeklyDays(rule.daysOfWeek)} />
          <MiniInfo Icon={Tag} label="Hiệu lực" value={formatEffectiveRange(rule)} />
        </div>

        <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
          {rule.discountType === 'FIXED_AMOUNT'
            ? 'Giảm một khoản tiền trên tổng giờ chơi của khách vãng lai.'
            : rule.discountType === 'FIXED_PER_HOUR'
              ? 'Giảm trên mỗi giờ chơi của khách vãng lai.'
              : 'Giảm trên tổng tiền giờ chơi của khách vãng lai.'}
        </p>

        <div className="mt-3 flex gap-2">
          <Button variant="secondary" size="sm" icon={Edit3} onClick={onEdit}>Sửa</Button>
          {rule.isActive && <Button variant="outline-danger" size="sm" icon={Pause} onClick={onDeactivate}>Tạm dừng</Button>}
          <Button variant="outline-danger" size="sm" icon={Trash2} onClick={onRemove}>Xoá</Button>
        </div>
      </div>
    </div>
  )
}

function MiniInfo({ Icon, label, value }: { Icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="rounded-lg bg-zinc-50 px-3 py-2 dark:bg-zinc-950">
      <p className="flex items-center gap-1 text-[11px] text-zinc-500 dark:text-zinc-400"><Icon size={12} />{label}</p>
      <p className="mt-1 truncate text-xs font-semibold text-zinc-950 dark:text-white">{value}</p>
    </div>
  )
}

function PromotionDialog({
  mode,
  rule,
  submitting,
  setSubmitting,
  onClose,
  onSaved,
}: {
  mode: 'create' | 'edit' | null
  rule: PromotionRule | null
  submitting: boolean
  setSubmitting: (value: boolean) => void
  onClose: () => void
  onSaved: (message: string) => Promise<void>
}) {
  const { error: notifyError } = useToast()
  const [form, setForm] = useState<PromotionFormState>(emptyForm)

  useEffect(() => {
    if (!mode) return
    if (mode === 'edit' && rule) {
      /* eslint-disable react-hooks/set-state-in-effect */
      setForm({
        name: rule.name,
        discountType: rule.discountType,
        discountValue: String(Number(rule.discountValue)),
        daysOfWeek: normalizeDays(rule.daysOfWeek),
        hourFrom: String(rule.hourFrom),
        hourTo: rule.hourTo === null ? '' : String(rule.hourTo),
        effectiveFrom: toDateInputValue(rule.effectiveFrom),
        effectiveTo: toDateInputValue(rule.effectiveTo),
        isActive: rule.isActive,
      })
      /* eslint-enable react-hooks/set-state-in-effect */
      return
    }
    setForm(emptyForm)
  }, [mode, rule])

  const submit = async () => {
    const payload = buildPromotionPayload(form)
    if ('error' in payload) {
      notifyError(payload.error)
      return
    }

    setSubmitting(true)
    try {
      const url = mode === 'edit' && rule ? `/api/promotions/${rule.id}` : '/api/promotions'
      const init = mode === 'edit'
        ? {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload.data),
          }
        : jsonRequest(payload.data)
      const data = await apiJson<PromotionRule>(url, init)
      if (!data.success) {
        notifyError(data.error || 'Không lưu được khuyến mại')
        return
      }
      await onSaved(mode === 'edit' ? 'Đã cập nhật khuyến mại' : 'Đã tạo khuyến mại')
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
      title={mode === 'edit' ? 'Sửa khuyến mại' : 'Thêm khuyến mại'}
      description="Chỉ áp dụng cho giờ chơi của khách vãng lai. Giá giờ chơi sau giảm không thấp hơn 0đ."
      size="lg"
      footer={<Button variant="inverse" size="lg" fullWidth disabled={submitting} onClick={submit}>{submitting ? 'Đang lưu...' : 'Lưu khuyến mại'}</Button>}
    >
      <PromotionForm form={form} setForm={setForm} />
    </Modal>
  )
}

function PromotionForm({
  form,
  setForm,
}: {
  form: PromotionFormState
  setForm: (form: PromotionFormState) => void
}) {
  const isPercent = form.discountType === 'PERCENT'

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="promotion-name" required>Tên khuyến mại</Label>
        <Input
          id="promotion-name"
          value={form.name}
          onChange={(event) => setForm({ ...form, name: event.target.value })}
          placeholder="Ví dụ: Ưu đãi buổi tối"
        />
      </div>

      <div>
        <Label required>Hình thức giảm</Label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <PromotionTypeButton
            active={!isPercent}
            Icon={Banknote}
            title="Giảm tiền cố định"
            description="Trừ một khoản tiền trên tổng giờ chơi."
            onClick={() => setForm({
              ...form,
              discountType: 'FIXED_AMOUNT',
              discountValue: form.discountType === 'FIXED_AMOUNT' ? form.discountValue : '50000',
            })}
          />
          <PromotionTypeButton
            active={isPercent}
            Icon={Percent}
            title="Giảm phần trăm"
            description="Giảm theo % trên tổng tiền giờ chơi khi checkout."
            onClick={() => setForm({
              ...form,
              discountType: 'PERCENT',
              discountValue: form.discountType === 'PERCENT' ? form.discountValue : '10',
            })}
          />
        </div>
      </div>

      <div>
        <Label htmlFor="promotion-value" required>{isPercent ? 'Phần trăm giảm' : 'Số tiền giảm'}</Label>
        <div className="relative">
          <Input
            id="promotion-value"
            type="number"
            min={isPercent ? '0.01' : '1'}
            max={isPercent ? '100' : undefined}
            step={isPercent ? '0.01' : '1000'}
            inputMode="decimal"
            value={form.discountValue}
            onChange={(event) => setForm({ ...form, discountValue: event.target.value })}
          />
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-medium text-zinc-500 dark:text-zinc-400">
            {isPercent ? '%' : 'đ'}
          </span>
        </div>
      </div>

      <WeeklyDaySelector value={form.daysOfWeek} onChange={(daysOfWeek) => setForm({ ...form, daysOfWeek })} />

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="promotion-hour-from" required>Bắt đầu hiệu lực lúc</Label>
          <Input id="promotion-hour-from" type="number" min="0" max="23" inputMode="numeric" value={form.hourFrom} onChange={(event) => setForm({ ...form, hourFrom: event.target.value })} />
        </div>
        <div>
          <Label htmlFor="promotion-hour-to">Hết hiệu lực lúc</Label>
          <Input id="promotion-hour-to" type="number" min="1" max="24" inputMode="numeric" value={form.hourTo} onChange={(event) => setForm({ ...form, hourTo: event.target.value })} placeholder="24" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="promotion-effective-from" required>Hiệu lực từ</Label>
          <Input id="promotion-effective-from" type="date" value={form.effectiveFrom} onChange={(event) => setForm({ ...form, effectiveFrom: event.target.value })} />
        </div>
        <div>
          <Label htmlFor="promotion-effective-to">Hiệu lực đến</Label>
          <Input id="promotion-effective-to" type="date" value={form.effectiveTo} onChange={(event) => setForm({ ...form, effectiveTo: event.target.value })} />
        </div>
      </div>

      <button
        type="button"
        aria-pressed={form.isActive}
        onClick={() => setForm({ ...form, isActive: !form.isActive })}
        className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors ${
          form.isActive
            ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200'
            : 'border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300'
        }`}
      >
        {form.isActive ? <Play size={17} /> : <Pause size={17} />}
        <span>
          <span className="block text-sm font-semibold">{form.isActive ? 'Đang bật' : 'Tạm dừng'}</span>
          <span className="mt-0.5 block text-xs opacity-80">{form.isActive ? 'Hiển thị để nhân viên chọn khi thu tiền trong thời gian hiệu lực.' : 'Giữ cấu hình nhưng không hiển thị để chọn khi thu tiền.'}</span>
        </span>
      </button>

      <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-700 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300">
        Ngày và khung giờ chỉ xác định thời gian hiệu lực. Nhân viên sẽ chọn tối đa một khuyến mại khi thu tiền; khung giờ kết thúc không bao gồm thời điểm đó.
      </div>
    </div>
  )
}

function PromotionTypeButton({
  active,
  Icon,
  title,
  description,
  onClick,
}: {
  active: boolean
  Icon: LucideIcon
  title: string
  description: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-xl border p-3 text-left transition-colors ${
        active
          ? 'border-blue-500 bg-blue-50 text-blue-800 dark:border-blue-400 dark:bg-blue-500/10 dark:text-blue-200'
          : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800'
      }`}
    >
      <Icon size={18} />
      <p className="mt-2 text-sm font-semibold">{title}</p>
      <p className="mt-1 text-xs opacity-75">{description}</p>
    </button>
  )
}

function WeeklyDaySelector({ value, onChange }: { value: number[]; onChange: (daysOfWeek: number[]) => void }) {
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
        <Button variant="secondary" size="xs" onClick={() => onChange(weekdayDays)}>T2-T6</Button>
        <Button variant="secondary" size="xs" onClick={() => onChange(weekendDays)}>Cuối tuần</Button>
        <Button variant="secondary" size="xs" onClick={() => onChange(allWeekDays)}>Cả tuần</Button>
      </div>
    </div>
  )
}

function AccessDenied() {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-6 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-100 text-zinc-400 dark:bg-zinc-800"><Ticket size={24} /></div>
      <h2 className="mt-4 text-sm font-semibold text-zinc-950 dark:text-white">Chỉ quản trị viên được sửa khuyến mại</h2>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Nhân viên sẽ chọn khuyến mại phù hợp khi thu tiền.</p>
    </section>
  )
}

function StatusBadge({ status }: { status: PromotionStatus }) {
  if (status === 'ACTIVE') return <Badge variant="success" size="sm">Hiệu lực</Badge>
  if (status === 'FUTURE') return <Badge variant="blue" size="sm">Sắp tới</Badge>
  if (status === 'PAUSED') return <Badge variant="default" size="sm">Tạm dừng</Badge>
  return <Badge variant="warning" size="sm">Hết hạn</Badge>
}

function getRuleStatus(rule: PromotionRule): PromotionStatus {
  if (!rule.isActive) return 'PAUSED'
  const now = new Date()
  const from = new Date(rule.effectiveFrom)
  const to = rule.effectiveTo ? new Date(rule.effectiveTo) : null
  if (from > now) return 'FUTURE'
  if (to && to < now) return 'EXPIRED'
  return 'ACTIVE'
}

function buildPromotionPayload(form: PromotionFormState): { data: unknown } | { error: string } {
  const name = form.name.trim()
  const daysOfWeek = normalizeDays(form.daysOfWeek)
  const hourFrom = Number(form.hourFrom)
  const hourTo = form.hourTo.trim() ? Number(form.hourTo) : null
  const discountValue = Number(form.discountValue)

  if (!name) return { error: 'Nhập tên khuyến mại' }
  if (daysOfWeek.length === 0) return { error: 'Chọn ít nhất một ngày lặp trong tuần' }
  if (!Number.isInteger(hourFrom) || hourFrom < 0 || hourFrom > 23) return { error: 'Giờ bắt đầu phải từ 0 đến 23' }
  if (hourTo !== null && (!Number.isInteger(hourTo) || hourTo < 1 || hourTo > 24)) return { error: 'Giờ kết thúc phải từ 1 đến 24' }
  if (hourTo !== null && hourTo <= hourFrom) return { error: 'Giờ kết thúc phải sau giờ bắt đầu' }
  if (!Number.isFinite(discountValue) || discountValue <= 0) return { error: 'Giá trị giảm phải lớn hơn 0' }
  if (form.discountType === 'PERCENT' && discountValue > 100) return { error: 'Phần trăm giảm không được vượt quá 100%' }
  if (!form.effectiveFrom) return { error: 'Chọn ngày bắt đầu hiệu lực' }
  if (form.effectiveTo && new Date(form.effectiveTo) < new Date(form.effectiveFrom)) return { error: 'Ngày hết hiệu lực phải sau ngày bắt đầu' }

  return {
    data: {
      name,
      discountType: form.discountType,
      discountValue,
      daysOfWeek,
      hourFrom,
      hourTo,
      effectiveFrom: form.effectiveFrom,
      effectiveTo: form.effectiveTo || null,
      isActive: form.isActive,
    },
  }
}

function normalizeDays(days: number[]): number[] {
  return allWeekDays.filter((day) => days.includes(day))
}

function formatPromotionValue(rule: PromotionRule): string {
  if (rule.discountType === 'PERCENT' || rule.discountType === 'PERCENT_PLAY_TIME') {
    return `${Number(rule.discountValue)}%`
  }
  if (rule.discountType === 'FIXED_AMOUNT') {
    return formatVND(Number(rule.discountValue))
  }
  return `${formatVND(Number(rule.discountValue))}/giờ`
}

function formatHourRange(hourFrom: number, hourTo: number | null): string {
  return `${hourFrom}:00 - ${hourTo ?? 24}:00`
}

function formatWeeklyDays(days: number[]): string {
  const normalized = normalizeDays(days)
  if (sameDays(normalized, allWeekDays)) return 'Cả tuần'
  if (sameDays(normalized, weekdayDays)) return 'Thứ 2 - Thứ 6'
  if (sameDays(normalized, weekendDays)) return 'Cuối tuần'
  return weekDays.filter((day) => normalized.includes(day.value)).map((day) => day.short).join(', ')
}

function sameDays(left: number[], right: number[]): boolean {
  const normalizedLeft = normalizeDays(left)
  const normalizedRight = normalizeDays(right)
  return normalizedLeft.length === normalizedRight.length && normalizedLeft.every((day, index) => day === normalizedRight[index])
}

function formatEffectiveRange(rule: PromotionRule): string {
  return `${formatDate(rule.effectiveFrom)}${rule.effectiveTo ? ` - ${formatDate(rule.effectiveTo)}` : ' trở đi'}`
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Asia/Ho_Chi_Minh',
  })
}

function toDateInputValue(value: string | null): string {
  return value ? value.split('T')[0] : ''
}
