'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, ShieldUser, Trash2, Pencil } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Modal } from '@/components/ui/modal'
import { NoticeCard } from '@/components/ui/notice-card'
import { AppSkeleton } from '@/components/ui/skeleton'
import { SortableCardList, type Column as CardColumn } from '@/components/ui/sortable-card-list'
import { SortableTable, type Column } from '@/components/ui/sortable-table'
import { useToast } from '@/components/ui/toast'
import { PERMISSION_GROUPS, hasAccess } from '@/lib/shared/permissions'
import { useApi } from '@/hooks/use-api'
import { apiJson, jsonRequest } from '@/lib/api'
import { usePageRefresh } from '@/components/layout/page-refresh-context'
import { PAGE_TITLE_CLASS } from '@/components/ui/page-title'
import type { UserSession } from '@/features/pos/types'

export interface RoleSummary {
  id: string
  key: string | null
  name: string
  description: string | null
  locked: boolean
  permissions: string[]
  userCount: number
}

interface RoleFormState {
  name: string
  description: string
  permissions: string[]
}

const emptyRoleForm: RoleFormState = { name: '', description: '', permissions: [] }

export function RolesScreen() {
  const { success: notifySuccess, error: notifyError } = useToast()
  const [editingRole, setEditingRole] = useState<RoleSummary | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteRole, setDeleteRole] = useState<RoleSummary | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const { data: rolesData, isLoading: rolesLoading, mutate } = useApi<RoleSummary[]>('/api/roles', { dedupingInterval: 60_000 })
  const { data: userData, isLoading: userLoading } = useApi<UserSession>('/api/auth/me', { dedupingInterval: 600_000 })

  const { registerRefresh } = usePageRefresh()

  useEffect(() => {
    return registerRefresh(() => void mutate())
  }, [registerRefresh, mutate])

  const roles: RoleSummary[] = rolesData?.data ?? []
  const error = !rolesData?.success ? (rolesData?.error as string ?? '') : ''
  const loading = rolesLoading || userLoading
  const user = userData?.data ?? null

  const canManage = hasAccess(user?.role?.permissions, user?.role?.key, 'roles.manage')

  const openCreate = () => {
    setEditingRole(null)
    setDialogOpen(true)
  }

  const openEdit = useCallback((role: RoleSummary) => {
    setEditingRole(role)
    setDialogOpen(true)
  }, [])

  const handleSaved = async (message: string) => {
    notifySuccess(message)
    setDialogOpen(false)
    setEditingRole(null)
    await mutate()
  }

  const confirmDelete = async () => {
    if (!deleteRole) return

    setSubmitting(true)
    try {
      const data = await apiJson<{ message?: string }>(`/api/roles/${deleteRole.id}`, { method: 'DELETE' })
      if (!data.success) {
        notifyError(data.error || 'Không xoá được vai trò')
        return
      }

      notifySuccess(data.data?.message || 'Đã xoá vai trò')
      setDeleteRole(null)
      await mutate()
    } catch {
      notifyError('Lỗi kết nối máy chủ')
    } finally {
      setSubmitting(false)
    }
  }

  const renderActions = useCallback((role: RoleSummary) => (
    <div className="flex gap-1.5">
      {!role.locked && (
        <Button
          variant="white"
          size="sm"
          icon={Pencil}
          disabled={submitting}
          onClick={() => openEdit(role)}
          title="Sửa vai trò"
        />
      )}
      {!role.locked && (
        <Button
          variant="red-soft"
          size="sm"
          icon={Trash2}
          disabled={submitting}
          onClick={() => setDeleteRole(role)}
          title="Xoá vai trò"
        />
      )}
    </div>
  ), [openEdit, submitting])

  const roleColumns: Column<RoleSummary>[] = useMemo(() => [
    {
      key: 'name',
      label: 'Vai trò',
      cellClassName: 'px-4 py-3 font-medium',
      render: (role) => (
        <span className="flex items-center gap-2 text-zinc-950 dark:text-white">
          {role.name}
          {role.locked && <Badge variant="purple" size="sm">Hệ thống</Badge>}
        </span>
      ),
    },
    {
      key: 'description',
      label: 'Mô tả',
      cellClassName: 'px-4 py-3 text-xs text-zinc-500 dark:text-zinc-400',
      render: (role) => role.description ?? '—',
    },
    {
      key: 'permissions',
      label: 'Quyền',
      cellClassName: 'px-4 py-3',
      render: (role) => (
        <span className="text-sm tabular-nums text-zinc-700 dark:text-zinc-300">
          {role.locked ? 'Toàn quyền' : `${role.permissions.length} quyền`}
        </span>
      ),
    },
    {
      key: 'userCount',
      label: 'Đang dùng',
      cellClassName: 'px-4 py-3 tabular-nums',
      render: (role) => `${role.userCount} người`,
    },
    {
      label: 'Thao tác',
      cellClassName: 'px-4 py-3',
      render: renderActions,
    },
  ], [renderActions])

  const roleCardColumns: CardColumn<RoleSummary>[] = useMemo(() => [
    {
      key: 'name',
      label: 'Vai trò',
      render: (role) => (
        <span className="flex items-center gap-2 text-base font-semibold text-zinc-950 dark:text-white">
          {role.name}
          {role.locked && <Badge variant="purple" size="sm">Hệ thống</Badge>}
        </span>
      ),
    },
    {
      key: 'permissions',
      label: 'Quyền',
      render: (role) => (role.locked ? 'Toàn quyền' : `${role.permissions.length} quyền · ${role.userCount} người dùng`),
    },
    {
      label: '',
      render: renderActions,
    },
  ], [renderActions])

  if (loading) {
    return <AppSkeleton />
  }

  const totalUsers = roles.reduce((sum, role) => sum + role.userCount, 0)

  const listHeader = (
    <div>
      <h2 className="text-sm font-semibold text-zinc-950 dark:text-white">Danh sách vai trò</h2>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        {roles.length} vai trò · {totalUsers} tài khoản đang gán
      </p>
    </div>
  )

  return (
    <div className="min-h-full bg-zinc-50 px-4 py-4 dark:bg-zinc-950 md:px-6 md:py-6">
      <div className="mx-auto max-w-content space-y-4">
        <header className="hidden items-center justify-between gap-3 md:flex">
          <div className="min-w-0">
            <h1 className={PAGE_TITLE_CLASS}>Vai trò</h1>
          </div>
        </header>

        {error && (
          <NoticeCard
            tone="danger"
            title="Không tải được dữ liệu"
            description={error}
          />
        )}

        <NoticeCard
          tone="info"
          title="Thay đổi quyền có hiệu lực trong tối đa 30 giây"
          description="Người dùng sẽ thấy menu và quyền mới sau khi tải lại trang."
        />

        {canManage && (
          <Button variant="contrast" size="lg" fullWidth icon={Plus} onClick={openCreate}>
            Tạo vai trò
          </Button>
        )}

        {/* Mobile: card list */}
        <div className="md:hidden">
          <SortableCardList
            header={listHeader}
            columns={roleCardColumns}
            data={roles}
            keyExtractor={(role) => role.id}
            search={{ placeholder: 'Tìm tên vai trò', getText: (role) => role.name }}
            sortableKeys={['name', 'userCount']}
            defaultSortKey="name"
            defaultSortDir="asc"
            emptyIcon={ShieldUser}
            emptyMessage="Chưa có vai trò nào"
            emptyDescription="Tạo vai trò đầu tiên rồi gán quyền chi tiết cho từng nhóm tính năng."
          />
        </div>

        {/* Desktop: table */}
        <div className="hidden md:block">
          <SortableTable
            header={listHeader}
            columns={roleColumns}
            data={roles}
            keyExtractor={(role) => role.id}
            search={{ placeholder: 'Tìm tên vai trò', getText: (role) => role.name }}
            sortableKeys={['name', 'userCount']}
            defaultSortKey="name"
            defaultSortDir="asc"
            emptyIcon={ShieldUser}
            emptyMessage="Chưa có vai trò nào"
            emptyDescription="Tạo vai trò đầu tiên rồi gán quyền chi tiết cho từng nhóm tính năng."
          />
        </div>
      </div>

      <RoleDialog
        open={dialogOpen}
        role={editingRole}
        submitting={submitting}
        setSubmitting={setSubmitting}
        onClose={() => {
          setDialogOpen(false)
          setEditingRole(null)
        }}
        onSaved={handleSaved}
      />

      <ConfirmDialog
        open={!!deleteRole}
        onClose={() => setDeleteRole(null)}
        title="Xoá vai trò"
        description={deleteRole ? `Xoá vai trò "${deleteRole.name}"?` : undefined}
        body={
          deleteRole && deleteRole.userCount > 0 ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-300">
              <strong>{deleteRole.userCount} tài khoản</strong> đang dùng vai trò này sẽ chuyển sang
              trạng thái <strong>&quot;Chưa phân vai&quot;</strong> — không thể truy cập tính năng nào
              cho đến khi được gán vai trò mới. Lịch sử và dữ liệu của họ vẫn giữ nguyên.
            </p>
          ) : (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Vai trò không còn ai dùng, có thể xoá an toàn.
            </p>
          )
        }
        confirmLabel="Xoá vai trò"
        submitting={submitting}
        onConfirm={confirmDelete}
      />
    </div>
  )
}

function RoleDialog({
  open,
  role,
  submitting,
  setSubmitting,
  onClose,
  onSaved,
}: {
  open: boolean
  role: RoleSummary | null
  submitting: boolean
  setSubmitting: (value: boolean) => void
  onClose: () => void
  onSaved: (message: string) => Promise<void>
}) {
  const { error: notifyError } = useToast()
  const [form, setForm] = useState<RoleFormState>(emptyRoleForm)
  const isEdit = !!role

  useEffect(() => {
    if (!open) return

    if (isEdit && role) {
      /* eslint-disable react-hooks/set-state-in-effect */
      setForm({
        name: role.name,
        description: role.description ?? '',
        permissions: role.permissions,
      })
      /* eslint-enable react-hooks/set-state-in-effect */
      return
    }

    setForm(emptyRoleForm)
  }, [open, isEdit, role])

  const togglePermission = (key: string) => {
    setForm((prev) => ({
      ...prev,
      permissions: prev.permissions.includes(key)
        ? prev.permissions.filter((k) => k !== key)
        : [...prev.permissions, key],
    }))
  }

  const submit = async () => {
    const name = form.name.trim()
    if (!name) {
      notifyError('Nhập tên vai trò')
      return
    }

    setSubmitting(true)
    try {
      const payload = {
        name,
        description: form.description.trim() || null,
        permissions: form.permissions,
      }
      const url = isEdit && role ? `/api/roles/${role.id}` : '/api/roles'
      const init = isEdit
        ? { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
        : jsonRequest(payload)

      const data = await apiJson<RoleSummary>(url, init)
      if (!data.success) {
        notifyError(data.error || 'Không lưu được vai trò')
        return
      }

      await onSaved(isEdit ? 'Đã cập nhật vai trò' : 'Đã tạo vai trò')
    } catch {
      notifyError('Lỗi kết nối máy chủ')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? `Sửa vai trò: ${role?.name}` : 'Tạo vai trò mới'}
      description="Chọn quyền cho từng nhóm tính năng. Nhóm nào không có quyền nào sẽ ẩn hoàn toàn khỏi menu của người dùng."
      size="lg"
      footer={
        <Button variant="contrast" size="lg" fullWidth disabled={submitting} onClick={submit}>
          {submitting ? 'Đang lưu...' : 'Lưu vai trò'}
        </Button>
      }
    >
      <div className="space-y-4">
        <div>
          <Label htmlFor="role-name" required>Tên vai trò</Label>
          <Input
            id="role-name"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            placeholder="Ví dụ: Thu ngân"
          />
        </div>

        <div>
          <Label htmlFor="role-description">Mô tả</Label>
          <Input
            id="role-description"
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
            placeholder="Mô tả ngắn về vai trò này"
          />
        </div>

        <div className="space-y-3">
          <Label required>Quyền</Label>
          {PERMISSION_GROUPS.map((group) => {
            const selectedCount = group.permissions.filter((p) => form.permissions.includes(p.key)).length
            return (
              <div key={group.key} className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    {group.label}
                  </p>
                  <span className="text-[10px] tabular-nums text-zinc-400 dark:text-zinc-500">
                    {selectedCount}/{group.permissions.length}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {group.permissions.map((permission) => {
                    const selected = form.permissions.includes(permission.key)
                    return (
                      <button
                        key={permission.key}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => togglePermission(permission.key)}
                        className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                          selected
                            ? 'border-info bg-info-bg text-info'
                            : 'border-zinc-200 text-zinc-500 hover:border-zinc-300 hover:text-zinc-700 dark:border-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
                        }`}
                      >
                        {permission.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </Modal>
  )
}
