'use client'

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  Edit2,
  History,
  Key,
  LogIn,
  LogOut,
  Plus,
  RefreshCw,
  Search,
  ShoppingBag,
  Timer,
  UserCheck,
  UserCog,
  UserPlus,
  UserX,
  Users,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { SortableTable, type Column } from '@/components/ui/sortable-table'
import { useApi } from '@/hooks/use-api'
import { Input, Label, Select } from '@/components/ui/input'
import { PasswordInput } from '@/components/ui/password-input'
import { Modal } from '@/components/ui/modal'
import { NoticeCard } from '@/components/ui/notice-card'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/components/ui/toast'
import { apiJson } from '@/lib/api'
import type { UserSession } from '@/features/pos/types'
import type { UserRole } from '@/types'

interface UserRow {
  id: string
  username: string
  fullName: string
  role: UserRole
  isActive: boolean
  createdAt: string
}

interface ActivityLogRow {
  id: string
  userId: string
  action: string
  entityType: string
  entityId: string
  details: unknown
  createdAt: string
  user: {
    id: string
    username: string
    fullName: string
    role: UserRole
  }
}

type StaffTabId = 'accounts' | 'logs'

const emptyCreateForm = {
  username: '',
  password: '',
  fullName: '',
  role: 'STAFF' as UserRole,
}

const actionLabels: Record<string, string> = {
  USER_CREATE: 'tạo tài khoản',
  USER_UPDATE: 'cập nhật tài khoản',
  USER_PASSWORD_RESET: 'đổi mật khẩu',
  SESSION_CHECK_IN: 'check-in khách',
  SESSION_CHECK_OUT: 'checkout khách',
  SESSION_SELL: 'bán kèm',
  SESSION_CANCEL: 'huỷ phiên',
  SESSION_UPDATE: 'sửa phiên',
  SHIFT_OPEN: 'mở ca',
  SHIFT_JOIN: 'vào ca',
  SHIFT_CLOSE: 'đóng ca',
  SHIFT_PARTICIPANT_UPSERT: 'thêm người vào ca',
  SHIFT_PARTICIPANT_REMOVE: 'rời ca',
  PRODUCT_CREATE: 'thêm hàng',
  STOCK_MOVEMENT: 'điều chỉnh kho',
  PRICING_RULE_CREATE: 'tạo bảng giá',
  PRICING_RULE_UPDATE: 'sửa bảng giá',
  PRICING_RULE_DELETE: 'xoá bảng giá',
  MEMBERSHIP_REGISTER: 'đăng ký hội viên',
  MEMBERSHIP_RENEW: 'gia hạn hội viên',
  MEMBERSHIP_PLAN_UPDATE: 'sửa gói hội viên',
  MEMBERSHIP_PLAN_DEACTIVATE: 'ngừng gói hội viên',
  MEMBERSHIP_PLAN_DELETE: 'xoá gói hội viên',
}

export default function StaffPage() {
  const [user, setUser] = useState<UserSession | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let mounted = true

    async function loadMe() {
      setLoading(true)
      setError('')
      try {
        const data = await apiJson<UserSession>('/api/auth/me')
        if (!data.success) throw new Error(data.error || 'Không tải được tài khoản')
        if (mounted) setUser(data.data ?? null)
      } catch (err) {
        if (mounted) setError((err as Error).message || 'Lỗi kết nối máy chủ')
      } finally {
        if (mounted) setLoading(false)
      }
    }

    void loadMe()
    return () => {
      mounted = false
    }
  }, [])

  if (loading) {
    return <StaffSkeleton />
  }

  const isAdmin = user?.role === 'ADMIN'

  return (
    <div className="min-h-full bg-zinc-50 px-4 py-4 dark:bg-zinc-950 md:px-6 md:py-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <header className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Quản trị nội bộ
            </p>
            <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold text-zinc-950 dark:text-white">
              <UserCog size={24} className="text-blue-500" />
              Nhân viên
            </h1>
          </div>
          {user && (
            <Badge variant={isAdmin ? 'purple' : 'default'}>
              {isAdmin ? 'Admin' : 'Staff'}
            </Badge>
          )}
        </header>

        {error && (
          <NoticeCard
            tone="danger"
            title="Không tải được dữ liệu"
            description={error}
          />
        )}

        {isAdmin ? (
          <StaffAdminPanel />
        ) : (
          <EmptyState
            icon={UserCog}
            message="Bạn không có quyền quản lý nhân viên"
            description="Chỉ quản trị viên được tạo tài khoản nội bộ và xem nhật ký hoạt động."
          />
        )}
      </div>
    </div>
  )
}

function StaffAdminPanel() {
  const [activeTab, setActiveTab] = useState<StaffTabId>('accounts')

  const { data: usersData, isLoading: usersLoading, mutate: reloadUsers } = useApi<UserRow[]>('/api/users', { dedupingInterval: 300_000 })

  const users: UserRow[] = usersData?.data ?? []
  const usersError = !usersData?.success ? (usersData?.error as string ?? '') : ''

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-zinc-200 bg-white p-1 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="grid grid-cols-2 gap-1">
          <TabButton
            active={activeTab === 'accounts'}
            icon={Users}
            label="Tài khoản"
            onClick={() => setActiveTab('accounts')}
          />
          <TabButton
            active={activeTab === 'logs'}
            icon={History}
            label="Nhật ký hoạt động"
            onClick={() => setActiveTab('logs')}
          />
        </div>
      </div>

      {activeTab === 'accounts' ? (
        <AccountsTab
          users={users}
          loading={usersLoading}
          error={usersError}
          onReload={async () => { await reloadUsers() }}
        />
      ) : (
        <ActivityLogsTab users={users} />
      )}
    </div>
  )
}

function TabButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean
  icon: typeof Users
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors ${
        active
          ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300'
          : 'text-zinc-500 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-zinc-800'
      }`}
    >
      <Icon size={16} />
      <span>{label}</span>
    </button>
  )
}

function AccountsTab({
  users,
  loading,
  error,
  onReload,
}: {
  users: UserRow[]
  loading: boolean
  error: string
  onReload: () => Promise<void>
}) {
  const { success: notifySuccess, error: notifyError } = useToast()
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState(emptyCreateForm)
  const [submitting, setSubmitting] = useState(false)
  const [resetTarget, setResetTarget] = useState<UserRow | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [roleEditTarget, setRoleEditTarget] = useState<UserRow | null>(null)
  const [selectedRole, setSelectedRole] = useState<UserRole>('STAFF')

  const stats = useMemo(() => ({
    total: users.length,
    active: users.filter((item) => item.isActive).length,
    admins: users.filter((item) => item.role === 'ADMIN').length,
    staff: users.filter((item) => item.role === 'STAFF').length,
  }), [users])

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitting(true)
    try {
      const data = await apiJson<UserRow>('/api/users', jsonRequest('POST', {
        username: form.username.trim(),
        password: form.password,
        fullName: form.fullName.trim(),
        role: form.role,
      }))

      if (!data.success) {
        notifyError(data.error || 'Không tạo được tài khoản')
        return
      }

      notifySuccess('Đã tạo tài khoản nhân viên')
      setShowCreate(false)
      setForm(emptyCreateForm)
      await onReload()
    } catch {
      notifyError('Lỗi kết nối máy chủ')
    } finally {
      setSubmitting(false)
    }
  }

  const handleToggleActive = async (user: UserRow) => {
    setSubmitting(true)
    try {
      const data = await apiJson<UserRow>(`/api/users/${user.id}`, jsonRequest('PUT', {
        isActive: !user.isActive,
      }))

      if (!data.success) {
        notifyError(data.error || 'Không cập nhật được tài khoản')
        return
      }

      notifySuccess(user.isActive ? 'Đã vô hiệu hoá tài khoản' : 'Đã kích hoạt tài khoản')
      await onReload()
    } catch {
      notifyError('Lỗi kết nối máy chủ')
    } finally {
      setSubmitting(false)
    }
  }

  const handleSaveRole = async () => {
    if (!roleEditTarget) return

    // Chặn làm mất quản trị viên duy nhất còn lại.
    if (selectedRole === 'STAFF' && roleEditTarget.role === 'ADMIN') {
      const otherAdmins = users.filter((item) => item.role === 'ADMIN' && item.id !== roleEditTarget.id)
      if (otherAdmins.length === 0) {
        notifyError('Phải giữ lại ít nhất một quản trị viên.')
        return
      }
    }

    setSubmitting(true)
    try {
      const data = await apiJson<UserRow>(`/api/users/${roleEditTarget.id}`, jsonRequest('PUT', {
        role: selectedRole,
      }))

      if (!data.success) {
        notifyError(data.error || 'Không cập nhật được vai trò')
        return
      }

      notifySuccess(
        `Đã cập nhật vai trò ${roleEditTarget.fullName} → ${selectedRole === 'ADMIN' ? 'Quản trị viên' : 'Nhân viên'}`,
      )
      setRoleEditTarget(null)
      await onReload()
    } catch {
      notifyError('Lỗi kết nối máy chủ')
    } finally {
      setSubmitting(false)
    }
  }

  const handleResetPassword = async () => {
    if (!resetTarget) return

    setSubmitting(true)
    try {
      const data = await apiJson(`/api/users/${resetTarget.id}`, jsonRequest('PATCH', {
        newPassword,
      }))

      if (!data.success) {
        notifyError(data.error || 'Không đổi được mật khẩu')
        return
      }

      notifySuccess(`Đã đổi mật khẩu cho ${resetTarget.fullName}`)
      setResetTarget(null)
      setNewPassword('')
    } catch {
      notifyError('Lỗi kết nối máy chủ')
    } finally {
      setSubmitting(false)
    }
  }

  const userColumns: Column<UserRow>[] = useMemo(() => [
    {
      key: 'fullName',
      label: 'Họ tên',
      cellClassName: 'px-4 py-3 font-medium text-zinc-950 dark:text-white',
      render: (item) => item.fullName,
    },
    {
      key: 'username',
      label: 'Tên đăng nhập',
      cellClassName: 'px-4 py-3 font-mono text-xs text-zinc-500 dark:text-zinc-400',
      render: (item) => item.username,
    },
    {
      key: 'role',
      label: 'Vai trò',
      cellClassName: 'px-4 py-3',
      render: (item) => (
        <Badge variant={item.role === 'ADMIN' ? 'purple' : 'default'} size="sm">
          {item.role === 'ADMIN' ? 'Admin' : 'Nhân viên'}
        </Badge>
      ),
    },
    {
      key: 'isActive',
      label: 'Trạng thái',
      cellClassName: 'px-4 py-3',
      render: (item) => (
        <Badge variant={item.isActive ? 'success' : 'danger'} size="sm">
          {item.isActive ? 'Đang hoạt động' : 'Đã khoá'}
        </Badge>
      ),
    },
    {
      key: 'createdAt',
      label: 'Ngày tạo',
      cellClassName: 'px-4 py-3 text-xs text-zinc-500 dark:text-zinc-400',
      render: (item) => formatDate(item.createdAt),
    },
    {
      label: 'Thao tác',
      cellClassName: 'px-4 py-3',
      render: (item) => (
        <div className="flex gap-1.5">
          <Button
            variant="secondary"
            size="sm"
            icon={Edit2}
            title="Sửa vai trò"
            onClick={() => {
              setRoleEditTarget(item)
              setSelectedRole(item.role)
            }}
          />
          <Button
            variant="secondary"
            size="sm"
            icon={Key}
            onClick={() => setResetTarget(item)}
            title="Đổi mật khẩu"
          />
          <Button
            variant={item.isActive ? 'outline-danger' : 'secondary'}
            size="sm"
            icon={item.isActive ? UserX : UserCheck}
            disabled={submitting}
            onClick={() => void handleToggleActive(item)}
            title={item.isActive ? 'Vô hiệu hoá' : 'Kích hoạt'}
          />
        </div>
      ),
    },
  ], [submitting, handleToggleActive])

  if (loading) {
    return <StaffSkeleton compact />
  }

  return (
    <div className="space-y-4">
      {error && (
        <NoticeCard
          tone="danger"
          title="Không tải được nhân viên"
          description={error}
        />
      )}

      <section className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <StaffStat label="Tổng" value={stats.total} />
        <StaffStat label="Đang hoạt động" value={stats.active} tone="success" />
        <StaffStat label="Admin" value={stats.admins} tone="purple" />
        <StaffStat label="Nhân viên" value={stats.staff} />
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-zinc-950 dark:text-white">
              Tài khoản nội bộ
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              {users.length} tài khoản trong hệ thống
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              icon={RefreshCw}
              onClick={() => void onReload()}
              title="Làm mới"
            />
            <Button
              variant="primary"
              size="sm"
              icon={Plus}
              onClick={() => setShowCreate((value) => !value)}
            >
              Tạo tài khoản
            </Button>
          </div>
        </div>

        {showCreate && (
          <form
            onSubmit={handleCreate}
            className="mt-4 rounded-xl border border-blue-200 bg-blue-50/60 p-4 dark:border-blue-500/20 dark:bg-blue-500/10"
          >
            <div className="grid gap-3 md:grid-cols-[1.2fr_1fr_1fr_160px_auto] md:items-end">
              <div>
                <Label htmlFor="staff-full-name" required>Họ tên</Label>
                <Input
                  id="staff-full-name"
                  required
                  value={form.fullName}
                  onChange={(event) => setForm({ ...form, fullName: event.target.value })}
                  placeholder="Nguyễn Văn A"
                />
              </div>
              <div>
                <Label htmlFor="staff-username" required>Tên đăng nhập</Label>
                <Input
                  id="staff-username"
                  required
                  value={form.username}
                  onChange={(event) => setForm({ ...form, username: event.target.value })}
                  placeholder="nva"
                />
              </div>
              <div>
                <Label htmlFor="staff-password" required>Mật khẩu</Label>
                <PasswordInput
                  id="staff-password"
                  required
                  value={form.password}
                  onChange={(event) => setForm({ ...form, password: event.target.value })}
                  placeholder="Ít nhất 6 ký tự"
                />
              </div>
              <div>
                <Label htmlFor="staff-role">Vai trò</Label>
                <Select
                  id="staff-role"
                  value={form.role}
                  onChange={(event) => setForm({ ...form, role: event.target.value as UserRole })}
                >
                  <option value="STAFF">Nhân viên</option>
                  <option value="ADMIN">Quản trị viên</option>
                </Select>
              </div>
              <div className="flex gap-2">
                <Button
                  type="submit"
                  variant="inverse"
                  size="md"
                  loading={submitting}
                  disabled={submitting}
                >
                  Tạo
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="md"
                  onClick={() => setShowCreate(false)}
                >
                  Huỷ
                </Button>
              </div>
            </div>
          </form>
        )}
      </section>

      <SortableTable
        columns={userColumns}
        data={users}
        keyExtractor={(u) => u.id}
        sortableKeys={['fullName', 'username', 'role', 'isActive', 'createdAt']}
        defaultSortKey="createdAt"
        emptyIcon={UserPlus}
        emptyMessage="Chưa có nhân viên nào"
        emptyDescription="Tạo tài khoản nội bộ đầu tiên để nhân viên đăng nhập POS."
      />

      <Modal
        open={!!resetTarget}
        onClose={() => {
          setResetTarget(null)
          setNewPassword('')
        }}
        size="sm"
        title="Đổi mật khẩu"
        description={resetTarget ? `Tài khoản ${resetTarget.fullName}` : undefined}
        footer={
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setResetTarget(null)
                setNewPassword('')
              }}
            >
              Huỷ
            </Button>
            <Button
              loading={submitting}
              disabled={submitting || newPassword.length < 6}
              onClick={() => void handleResetPassword()}
            >
              Đổi mật khẩu
            </Button>
          </div>
        }
      >
        <Label htmlFor="staff-new-password" required>Mật khẩu mới</Label>
        <PasswordInput
          id="staff-new-password"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          placeholder="Ít nhất 6 ký tự"
        />
        {newPassword.length > 0 && newPassword.length < 6 && (
          <p className="mt-1 text-xs text-red-500">Mật khẩu phải có ít nhất 6 ký tự</p>
        )}
      </Modal>

      <Modal
        open={!!roleEditTarget}
        onClose={() => setRoleEditTarget(null)}
        size="sm"
        title="Vai trò tài khoản"
        description={roleEditTarget ? `Tài khoản ${roleEditTarget.fullName}` : undefined}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setRoleEditTarget(null)}>
              Hủy
            </Button>
            <Button
              loading={submitting}
              disabled={submitting}
              onClick={() => void handleSaveRole()}
            >
              Lưu
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <div>
            <Label htmlFor="role-edit-select">Vai trò</Label>
            <Select
              id="role-edit-select"
              value={selectedRole}
              onChange={(event) => setSelectedRole(event.target.value as UserRole)}
            >
              <option value="STAFF">Nhân viên</option>
              <option value="ADMIN">Quản trị viên</option>
            </Select>
          </div>
        </div>
      </Modal>
    </div>
  )
}

function ActivityLogsTab({ users }: { users: UserRow[] }) {
  const [logs, setLogs] = useState<ActivityLogRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedUserId, setSelectedUserId] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  const loadLogs = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ limit: '100' })
      if (selectedUserId) params.set('userId', selectedUserId)
      if (searchQuery.trim()) params.set('search', searchQuery.trim())

      const data = await apiJson<ActivityLogRow[]>(`/api/activity-logs?${params.toString()}`)
      if (!data.success) throw new Error(data.error || 'Không tải được nhật ký hoạt động')
      setLogs(data.data ?? [])
    } catch (err) {
      setError((err as Error).message || 'Lỗi kết nối máy chủ')
    } finally {
      setLoading(false)
    }
  }, [selectedUserId, searchQuery])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadLogs()
  }, [loadLogs])

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-col gap-3 md:flex-row md:items-end">
          <div className="md:w-64">
            <Label htmlFor="activity-user-filter">Nhân viên</Label>
            <Select
              id="activity-user-filter"
              value={selectedUserId}
              onChange={(event) => setSelectedUserId(event.target.value)}
            >
              <option value="">Tất cả nhân viên</option>
              {users.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.fullName}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex-1">
            <Label htmlFor="activity-search">Tìm kiếm</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search
                  size={15}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
                />
                <Input
                  id="activity-search"
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      setSearchQuery(searchInput)
                    }
                  }}
                  className="pl-9"
                  placeholder="Tên nhân viên, hành động, đối tượng"
                />
              </div>
              <Button
                variant="secondary"
                onClick={() => setSearchQuery(searchInput)}
              >
                Tìm
              </Button>
              <Button
                variant="secondary"
                icon={RefreshCw}
                onClick={() => void loadLogs()}
                title="Làm mới"
              />
            </div>
          </div>
        </div>
      </section>

      {error && (
        <NoticeCard
          tone="danger"
          title="Không tải được nhật ký"
          description={error}
        />
      )}

      <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <div>
            <h2 className="text-sm font-semibold text-zinc-950 dark:text-white">
              Nhật ký hoạt động
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {logs.length} dòng mới nhất
            </p>
          </div>
        </div>

        {loading ? (
          <div className="space-y-3 p-4">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        ) : logs.length === 0 ? (
          <EmptyState
            icon={History}
            message="Chưa có nhật ký hoạt động"
            description="Nhật ký sẽ xuất hiện khi có hoạt động check-in, checkout, hoặc thay đổi dữ liệu."
          />
        ) : (
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {groupLogsByDate(logs).map((group) => (
              <div key={group.date}>
                <div className="sticky top-0 z-10 border-b border-zinc-100 bg-zinc-50/95 px-4 py-2.5 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-950/95">
                  <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    {group.label}
                  </span>
                  <span className="ml-2 text-[10px] text-zinc-400 dark:text-zinc-500">
                    {group.items.length} hoạt động
                  </span>
                </div>
                {group.items.map((log) => (
                  <ActivityLogItem key={log.id} log={log} />
                ))}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function ActivityLogItem({ log }: { log: ActivityLogRow }) {
  const iconColor = getLogColor(log.action)
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${iconColor.bg}`}>
        {getLogIcon(log.action)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">
          <span className="font-semibold text-zinc-900 dark:text-white">{log.user.fullName}</span>
          {' '}
          <span className="text-zinc-500 dark:text-zinc-400">
            {actionLabels[log.action] ?? log.action.replaceAll('_', ' ').toLowerCase()}
          </span>
        </p>
      </div>
      <span className="shrink-0 text-xs tabular-nums text-zinc-400 dark:text-zinc-500">
        {formatDateTime(log.createdAt)}
      </span>
    </div>
  )
}

function getLogColor(action: string) {
  if (action.startsWith('SESSION')) return { bg: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400' }
  if (action.startsWith('SHIFT')) return { bg: 'bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400' }
  if (action.startsWith('MEMBERSHIP')) return { bg: 'bg-purple-100 text-purple-600 dark:bg-purple-500/20 dark:text-purple-400' }
  if (action.startsWith('PRICING') || action.startsWith('PRODUCT') || action.startsWith('STOCK')) return { bg: 'bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400' }
  return { bg: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-500/20 dark:text-zinc-400' }
}

function getLogIcon(action: string) {
  if (action === 'SESSION_CHECK_IN') return <LogIn size={16} />
  if (action === 'SESSION_CHECK_OUT') return <LogOut size={16} />
  if (action === 'SESSION_SELL') return <ShoppingBag size={16} />
  if (action.startsWith('SHIFT')) return <Timer size={16} />
  if (action.startsWith('MEMBERSHIP')) return <UserCheck size={16} />
  if (action.startsWith('USER')) return <UserCog size={16} />
  return <History size={16} />
}

function StaffStat({
  label,
  value,
  tone = 'default',
}: {
  label: string
  value: number
  tone?: 'success' | 'purple' | 'default'
}) {
  const valueClass = tone === 'success'
    ? 'text-emerald-600 dark:text-emerald-300'
    : tone === 'purple'
      ? 'text-purple-600 dark:text-purple-300'
      : 'text-zinc-950 dark:text-white'

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-[11px] text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className={`mt-1 text-xl font-bold tabular-nums ${valueClass}`}>{value}</p>
    </div>
  )
}

function StaffSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <div className="space-y-4 p-4 md:p-6">
      {!compact && <Skeleton className="h-10 w-44" />}
      <Skeleton className="h-12 w-full" />
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </div>
      <Skeleton className="h-72 w-full" />
    </div>
  )
}

function TableHead({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
      {children}
    </th>
  )
}

function jsonRequest(method: 'POST' | 'PUT' | 'PATCH', body: unknown): RequestInit {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const csrfToken = typeof document !== 'undefined'
    ? document.cookie.match(/(?:^|;\s*)qltrungcung_csrf=([^;]*)/)?.[1]
    : null
  if (csrfToken) headers['X-CSRF-Token'] = decodeURIComponent(csrfToken)
  return {
    method,
    headers,
    body: JSON.stringify(body),
  }
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('vi-VN')
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDateLabel(dateStr: string): string {
  const date = new Date(dateStr)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  if (date.toDateString() === today.toDateString()) return 'Hôm nay'
  if (date.toDateString() === yesterday.toDateString()) return 'Hôm qua'

  return date.toLocaleDateString('vi-VN', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function groupLogsByDate(logs: ActivityLogRow[]) {
  const groups = new Map<string, ActivityLogRow[]>()
  for (const log of logs) {
    const date = new Date(log.createdAt).toDateString()
    if (!groups.has(date)) groups.set(date, [])
    groups.get(date)!.push(log)
  }
  return Array.from(groups.entries()).map(([date, items]) => ({
    date,
    label: formatDateLabel(date),
    items,
  }))
}

