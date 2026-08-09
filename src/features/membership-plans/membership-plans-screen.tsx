'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CalendarClock,
  Edit3,
  Plus,
  RefreshCw,
  Ticket,
  Trash2,
  type LucideIcon,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { FilterButton } from '@/components/ui/filter-button'
import { Input, Label, Select } from '@/components/ui/input'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Modal } from '@/components/ui/modal'
import { NoticeCard } from '@/components/ui/notice-card'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/components/ui/toast'
import { useApi } from '@/hooks/use-api'
import { apiJson, jsonRequest } from '@/features/pos/api'
import type { UserSession } from '@/features/pos/types'
import { formatVND } from '@/lib/shared/utils'

type PlanFilter = 'ALL' | 'ACTIVE' | 'INACTIVE'
type DialogMode = 'create' | 'edit'

interface MembershipPlan {
  id: string
  name: string
  durationMonths: number
  price: number | string
  isActive: boolean
  createdAt?: string
  updatedAt?: string
}

interface PlanFormState {
  name: string
  durationMonths: string
  price: string
  isActive: 'true' | 'false'
}

const emptyPlanForm: PlanFormState = {
  name: '',
  durationMonths: '1',
  price: '500000',
  isActive: 'true',
}

export function MembershipPlansScreen() {
  const { success: notifySuccess, error: notifyError } = useToast()
  const [filter, setFilter] = useState<PlanFilter>('ALL')
  const [dialogMode, setDialogMode] = useState<DialogMode | null>(null)
  const [editingPlan, setEditingPlan] = useState<MembershipPlan | null>(null)
  const [deletePlan, setDeletePlan] = useState<MembershipPlan | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const { data: plansData, isLoading: plansLoading, mutate } = useApi<MembershipPlan[]>('/api/membership-plans', { dedupingInterval: 300_000 })
  const { data: userData, isLoading: userLoading } = useApi<UserSession>('/api/auth/me', { dedupingInterval: 600_000 })

  const plans: MembershipPlan[] = plansData?.data ?? []
  const error = !plansData?.success ? (plansData?.error as string ?? '') : ''
  const loading = plansLoading || userLoading
  const user = userData?.data ?? null

  const stats = useMemo(() => {
    const active = plans.filter((plan) => plan.isActive).length
    const inactive = plans.length - active
    const shortest = plans.length
      ? Math.min(...plans.map((plan) => plan.durationMonths))
      : 0
    return {
      total: plans.length,
      active,
      inactive,
      shortest,
    }
  }, [plans])

  const filteredPlans = useMemo(
    () => plans.filter((plan) => {
      if (filter === 'ACTIVE') return plan.isActive
      if (filter === 'INACTIVE') return !plan.isActive
      return true
    }),
    [plans, filter]
  )

  const isAdmin = user?.role === 'ADMIN'

  const openCreate = () => {
    setEditingPlan(null)
    setDialogMode('create')
  }

  const openEdit = (plan: MembershipPlan) => {
    setEditingPlan(plan)
    setDialogMode('edit')
  }

  const handleSaved = async (message: string) => {
    notifySuccess(message)
    setDialogMode(null)
    setEditingPlan(null)
    await mutate()
  }

  const confirmDelete = async () => {
    if (!deletePlan) return

    setSubmitting(true)
    try {
      const data = await apiJson<MembershipPlan>(`/api/membership-plans/${deletePlan.id}`, {
        method: 'DELETE',
      })
      if (!data.success) {
        notifyError(data.error || 'Không xóa được gói hội viên')
        return
      }

      notifySuccess(data.data && !data.data.isActive
        ? 'Gói đang được dùng, đã chuyển sang ngừng dùng'
        : 'Đã xóa gói hội viên')
      setDeletePlan(null)
      await mutate()
    } catch {
      notifyError('Lỗi kết nối máy chủ')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <MembershipPlansSkeleton />
  }

  return (
    <div className="min-h-full bg-zinc-50 px-4 py-4 dark:bg-zinc-950 md:px-6 md:py-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <header className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Thiết lập hội viên
            </p>
            <h1 className="mt-1 text-2xl font-bold text-zinc-950 dark:text-white">
              Gói hội viên
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

        {!isAdmin ? (
          <AccessDenied />
        ) : (
          <>
            <NoticeCard
              tone={stats.active > 0 ? 'success' : 'warning'}
              title={stats.active > 0 ? 'Có gói đang bán' : 'Chưa có gói đang bán'}
              description={
                stats.active > 0
                  ? `${stats.active} gói có thể dùng để đăng ký hoặc gia hạn hội viên.`
                  : 'Nhân viên không thể thu phí hội viên nếu không có gói đang dùng.'
              }
            />

            <section className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <PlanStat label="Tất cả" value={stats.total} active={filter === 'ALL'} onClick={() => setFilter('ALL')} />
              <PlanStat label="Đang bán" value={stats.active} active={filter === 'ACTIVE'} onClick={() => setFilter('ACTIVE')} />
              <PlanStat label="Ngừng dùng" value={stats.inactive} active={filter === 'INACTIVE'} onClick={() => setFilter('INACTIVE')} warning={stats.inactive > 0} />
              <PlanStat label="Gói ngắn nhất" value={stats.shortest} suffix="tháng" active={false} onClick={() => setFilter('ALL')} />
            </section>

            <section className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex gap-2 overflow-x-auto pb-1">
                <FilterButton active={filter === 'ALL'} onClick={() => setFilter('ALL')}>Tất cả</FilterButton>
                <FilterButton active={filter === 'ACTIVE'} onClick={() => setFilter('ACTIVE')}>Đang bán</FilterButton>
                <FilterButton active={filter === 'INACTIVE'} onClick={() => setFilter('INACTIVE')}>Ngừng dùng</FilterButton>
              </div>
            </section>

            <Button
              variant="inverse"
              size="lg"
              fullWidth
              icon={Plus}
              onClick={openCreate}
            >
              Thêm gói hội viên
            </Button>

            <section className="rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
                <div>
                  <h2 className="text-sm font-semibold text-zinc-950 dark:text-white">
                    Danh sách gói
                  </h2>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    {filteredPlans.length} gói · {stats.active} đang bán · {stats.inactive} ngừng dùng
                  </p>
                </div>
                <Badge variant={stats.active > 0 ? 'success' : 'warning'}>
                  {stats.active > 0 ? 'Sẵn sàng' : 'Thiếu gói'}
                </Badge>
              </div>

              {filteredPlans.length === 0 ? (
                <EmptyState
                  icon={Ticket}
                  message="Chưa có gói phù hợp"
                  description="Thử đổi bộ lọc hoặc thêm gói hội viên mới."
                  action={
                    <Button variant="secondary" size="sm" icon={Plus} onClick={openCreate}>
                      Thêm gói
                    </Button>
                  }
                />
              ) : (
                <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {filteredPlans.map((plan) => (
                    <MembershipPlanCard
                      key={plan.id}
                      plan={plan}
                      onEdit={() => openEdit(plan)}
                      onDelete={() => setDeletePlan(plan)}
                    />
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>

      <MembershipPlanDialog
        mode={dialogMode}
        plan={editingPlan}
        submitting={submitting}
        setSubmitting={setSubmitting}
        onClose={() => {
          setDialogMode(null)
          setEditingPlan(null)
        }}
        onSaved={handleSaved}
      />

      <ConfirmDialog
        open={!!deletePlan}
        onClose={() => setDeletePlan(null)}
        title="Xóa gói hội viên"
        description={deletePlan ? `Gói "${deletePlan.name}" sẽ bị xóa nếu chưa phát sinh hội viên.` : undefined}
        body={
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Nếu gói đã được dùng bởi hội viên, hệ thống sẽ chuyển gói sang trạng thái ngừng dùng để giữ lịch sử thu phí.
          </p>
        }
        confirmLabel="Xóa"
        submitting={submitting}
        onConfirm={confirmDelete}
      />
    </div>
  )
}

function MembershipPlansSkeleton() {
  return (
    <div className="space-y-4 p-4 md:p-6">
      <Skeleton className="h-10 w-40" />
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

function PlanStat({
  label,
  value,
  suffix,
  active,
  warning,
  onClick,
}: {
  label: string
  value: number
  suffix?: string
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
        {suffix && <span className="ml-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">{suffix}</span>}
      </p>
    </button>
  )
}

function MembershipPlanCard({
  plan,
  onEdit,
  onDelete,
}: {
  plan: MembershipPlan
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <div className="px-4 py-3">
      <div className="grid grid-cols-[1fr_auto] gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold text-zinc-950 dark:text-white">
              {plan.name}
            </p>
            <Badge variant={plan.isActive ? 'success' : 'default'} size="sm">
              {plan.isActive ? 'Đang bán' : 'Ngừng dùng'}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Dùng cho đăng ký mới và gia hạn hội viên
          </p>
        </div>
        <p className="self-start text-sm font-bold tabular-nums text-zinc-950 dark:text-white">
          {formatVND(Number(plan.price))}
        </p>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <MiniInfo Icon={CalendarClock} label="Thời hạn" value={`${plan.durationMonths} tháng`} />
        <MiniInfo Icon={Ticket} label="Trạng thái" value={plan.isActive ? 'Cho phép bán' : 'Không cho bán'} />
      </div>

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

function MembershipPlanDialog({
  mode,
  plan,
  submitting,
  setSubmitting,
  onClose,
  onSaved,
}: {
  mode: DialogMode | null
  plan: MembershipPlan | null
  submitting: boolean
  setSubmitting: (value: boolean) => void
  onClose: () => void
  onSaved: (message: string) => Promise<void>
}) {
  const { error: notifyError } = useToast()
  const [form, setForm] = useState<PlanFormState>(emptyPlanForm)

  useEffect(() => {
    if (!mode) return

    if (mode === 'edit' && plan) {
      /* eslint-disable react-hooks/set-state-in-effect */
      setForm({
        name: plan.name,
        durationMonths: String(plan.durationMonths),
        price: String(Number(plan.price)),
        isActive: plan.isActive ? 'true' : 'false',
      })
      /* eslint-enable react-hooks/set-state-in-effect */
      return
    }

    setForm(emptyPlanForm)
  }, [mode, plan])

  const submit = async () => {
    const payload = buildPlanPayload(form)
    if ('error' in payload) {
      notifyError(payload.error)
      return
    }

    setSubmitting(true)
    try {
      const url = mode === 'edit' && plan ? `/api/membership-plans/${plan.id}` : '/api/membership-plans'
      const init = mode === 'edit'
        ? {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload.data),
          }
        : jsonRequest(payload.data)

      const data = await apiJson<MembershipPlan>(url, init)
      if (!data.success) {
        notifyError(data.error || 'Không lưu được gói hội viên')
        return
      }

      await onSaved(mode === 'edit' ? 'Đã cập nhật gói hội viên' : 'Đã tạo gói hội viên')
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
      title={mode === 'edit' ? 'Sửa gói hội viên' : 'Thêm gói hội viên'}
      description="Gói đang bán sẽ xuất hiện trong đăng ký mới và gia hạn hội viên"
      size="lg"
      footer={
        <Button variant="inverse" size="lg" fullWidth disabled={submitting} onClick={submit}>
          {submitting ? 'Đang lưu...' : 'Lưu gói hội viên'}
        </Button>
      }
    >
      <PlanForm form={form} setForm={setForm} />
    </Modal>
  )
}

function PlanForm({
  form,
  setForm,
}: {
  form: PlanFormState
  setForm: (form: PlanFormState) => void
}) {
  return (
    <div className="space-y-3">
      <div>
        <Label htmlFor="plan-name" required>Tên gói</Label>
        <Input
          id="plan-name"
          value={form.name}
          onChange={(event) => setForm({ ...form, name: event.target.value })}
          placeholder="Ví dụ: Gói tháng tiêu chuẩn"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="plan-duration" required>Số tháng</Label>
          <Input
            id="plan-duration"
            type="number"
            min="1"
            step="1"
            inputMode="numeric"
            value={form.durationMonths}
            onChange={(event) => setForm({ ...form, durationMonths: event.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="plan-price" required>Giá gói</Label>
          <Input
            id="plan-price"
            type="number"
            min="1000"
            step="1000"
            inputMode="numeric"
            value={form.price}
            onChange={(event) => setForm({ ...form, price: event.target.value })}
          />
        </div>
      </div>

      <div>
        <Label htmlFor="plan-status">Trạng thái</Label>
        <Select
          id="plan-status"
          value={form.isActive}
          onChange={(event) => setForm({ ...form, isActive: event.target.value as 'true' | 'false' })}
        >
          <option value="true">Đang bán</option>
          <option value="false">Ngừng dùng</option>
        </Select>
      </div>

      <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-700 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300">
        Gói ngừng dùng vẫn giữ lịch sử hội viên và thanh toán cũ, nhưng không xuất hiện trong form đăng ký hoặc gia hạn mới.
      </div>
    </div>
  )
}

function AccessDenied() {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-6 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-100 text-zinc-400 dark:bg-zinc-800">
        <Ticket size={24} />
      </div>
      <h2 className="mt-4 text-sm font-semibold text-zinc-950 dark:text-white">
        Chỉ quản trị viên được quản lý gói hội viên
      </h2>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        Nhân viên vẫn chọn gói đang bán trong màn đăng ký và gia hạn hội viên.
      </p>
    </section>
  )
}

function buildPlanPayload(form: PlanFormState):
  | { data: { name: string; durationMonths: number; price: number; isActive: boolean } }
  | { error: string } {
  const name = form.name.trim()
  const durationMonths = Number(form.durationMonths)
  const price = Number(form.price)

  if (!name) return { error: 'Nhập tên gói hội viên' }
  if (!Number.isInteger(durationMonths) || durationMonths <= 0) {
    return { error: 'Số tháng phải là số nguyên lớn hơn 0' }
  }
  if (!Number.isFinite(price) || price <= 0) {
    return { error: 'Giá gói phải lớn hơn 0' }
  }

  return {
    data: {
      name,
      durationMonths,
      price,
      isActive: form.isActive === 'true',
    },
  }
}
