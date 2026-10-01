'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Edit3,
  Plus,
  Ticket,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FilterButton } from '@/components/ui/filter-button'
import { Input, Label, Select } from '@/components/ui/input'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Modal } from '@/components/ui/modal'
import { NoticeCard } from '@/components/ui/notice-card'
import { AppSkeleton } from '@/components/ui/skeleton'
import { SortableCardList, type Column as CardColumn } from '@/components/ui/sortable-card-list'
import { SortableTable, type Column } from '@/components/ui/sortable-table'
import { useToast } from '@/components/ui/toast'
import { isAdminOnly } from '@/lib/shared/roles'
import { useApi } from '@/hooks/use-api'
import { apiJson, jsonRequest } from '@/lib/api'
import { usePageRefresh } from '@/components/layout/page-refresh-context'
import { PAGE_TITLE_CLASS } from '@/components/ui/page-title'
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

  const { registerRefresh } = usePageRefresh()

  useEffect(() => {
    return registerRefresh(() => void mutate())
  }, [registerRefresh, mutate])

  const plans: MembershipPlan[] = plansData?.data ?? []
  const error = !plansData?.success ? (plansData?.error as string ?? '') : ''
  const loading = plansLoading || userLoading
  const user = userData?.data ?? null

  const stats = useMemo(() => {
    const active = plans.filter((plan) => plan.isActive).length
    const inactive = plans.length - active
    return {
      active,
      inactive,
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

  const isAdmin = isAdminOnly(user?.role)

  const openCreate = () => {
    setEditingPlan(null)
    setDialogMode('create')
  }

  const openEdit = useCallback((plan: MembershipPlan) => {
    setEditingPlan(plan)
    setDialogMode('edit')
  }, [])

  const renderActions = useCallback((plan: MembershipPlan) => (
    <div className="flex gap-1.5">
      <Button
        variant="white"
        size="sm"
        icon={Edit3}
        disabled={submitting}
        onClick={() => openEdit(plan)}
        title="Sửa gói"
      />
      <Button
        variant="red-soft"
        size="sm"
        icon={Trash2}
        disabled={submitting}
        onClick={() => setDeletePlan(plan)}
        title="Xoá gói"
      />
    </div>
  ), [openEdit, submitting])

  const planColumns: Column<MembershipPlan>[] = useMemo(() => [
    {
      key: 'name',
      label: 'Tên gói',
      cellClassName: 'px-4 py-3 font-medium',
      render: (plan) => <span className={planNameColor(plan.isActive)}>{plan.name}</span>,
    },
    {
      key: 'durationMonths',
      label: 'Thời hạn',
      cellClassName: 'px-4 py-3 text-xs text-zinc-500 dark:text-zinc-400',
      render: (plan) => `${plan.durationMonths} tháng`,
    },
    {
      label: 'Giá gói',
      cellClassName: 'px-4 py-3 font-semibold tabular-nums text-zinc-950 dark:text-white',
      render: (plan) => formatVND(Number(plan.price)),
    },
    {
      label: 'Thao tác',
      cellClassName: 'px-4 py-3',
      render: renderActions,
    },
  ], [renderActions])

  const planCardColumns: CardColumn<MembershipPlan>[] = useMemo(() => [
    {
      key: 'name',
      label: 'Tên gói',
      render: (plan) => (
        <span className={`text-base font-semibold ${planNameColor(plan.isActive)}`}>
          {plan.name}
        </span>
      ),
    },
    {
      key: 'durationMonths',
      label: 'Thời hạn',
      render: (plan) => `${plan.durationMonths} tháng`,
    },
    {
      key: 'price',
      label: 'Giá',
      render: (plan) => (
        <span className="font-semibold tabular-nums text-zinc-950 dark:text-white">
          {formatVND(Number(plan.price))}
        </span>
      ),
    },
    {
      label: '',
      render: renderActions,
    },
  ], [renderActions])

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
    return <AppSkeleton />
  }

  const listHeader = (
    <div>
      <h2 className="text-sm font-semibold text-zinc-950 dark:text-white">
        Danh sách gói
      </h2>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        {filteredPlans.length} gói · {stats.active} đang bán · {stats.inactive} ngừng dùng
      </p>
      <div role="group" aria-label="Lọc gói hội viên" className="mt-2 flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
        <FilterButton active={filter === 'ALL'} onClick={() => setFilter('ALL')}>Tất cả</FilterButton>
        <FilterButton active={filter === 'ACTIVE'} onClick={() => setFilter('ACTIVE')}>Đang bán</FilterButton>
        <FilterButton active={filter === 'INACTIVE'} onClick={() => setFilter('INACTIVE')}>Ngừng dùng</FilterButton>
      </div>
    </div>
  )

  return (
    <div className="min-h-full bg-zinc-50 px-4 py-4 dark:bg-zinc-950 md:px-6 md:py-6">
      <div className="mx-auto max-w-content space-y-4">
        <header className="hidden items-center justify-between gap-3 md:flex">
          <div className="min-w-0">
            <h1 className={PAGE_TITLE_CLASS}>
              Gói hội viên
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
            <Button
              variant="contrast"
              size="lg"
              fullWidth
              icon={Plus}
              onClick={openCreate}
            >
              Thêm gói hội viên
            </Button>

            {/* Mobile: card list */}
            <div className="md:hidden">
              <SortableCardList
                header={listHeader}
                columns={planCardColumns}
                data={filteredPlans}
                keyExtractor={(plan) => plan.id}
                search={{
                  placeholder: 'Tìm tên gói',
                  getText: (plan) => plan.name,
                }}
                sortableKeys={['name', 'durationMonths']}
                defaultSortKey="durationMonths"
                defaultSortDir="asc"
                emptyIcon={Ticket}
                emptyMessage="Chưa có gói hội viên"
                emptyDescription="Thêm gói để nhân viên đăng ký và gia hạn hội viên."
              />
            </div>

            {/* Desktop: table */}
            <div className="hidden md:block">
              <SortableTable
                header={listHeader}
                columns={planColumns}
                data={filteredPlans}
                keyExtractor={(plan) => plan.id}
                search={{
                  placeholder: 'Tìm tên gói',
                  getText: (plan) => plan.name,
                }}
                sortableKeys={['name', 'durationMonths']}
                defaultSortKey="durationMonths"
                defaultSortDir="asc"
                emptyIcon={Ticket}
                emptyMessage="Chưa có gói hội viên"
                emptyDescription="Thêm gói để nhân viên đăng ký và gia hạn hội viên."
              />
            </div>
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

function planNameColor(isActive: boolean) {
  return isActive ? 'text-zinc-950 dark:text-white' : 'text-zinc-500 dark:text-zinc-400'
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
      <Button variant="contrast" size="lg" fullWidth disabled={submitting} onClick={submit}>
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

    <div className="rounded-xl border border-info-border bg-info-bg p-3 text-xs text-info border-info-border bg-info-bg text-info">
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
