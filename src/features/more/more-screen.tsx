'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { LucideIcon } from 'lucide-react'
import {
  AlertCircle,
  ArrowRight,
  ArrowRightLeft,
  Banknote,
  BarChart3,
  CalendarClock,
  Car,
  CheckCircle2,
  GraduationCap,
  LogOut,
  Monitor,
  Moon,
  Package,
  RefreshCw,
  Settings,
  ShieldCheck,
  Sun,
  Tag,
  Ticket,
  Timer,
  UserCog,
  Wrench,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { NoticeCard } from '@/components/ui/notice-card'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/components/ui/toast'
import { useApi } from '@/hooks/use-api'
import { apiJson } from '@/lib/api'
import { isAdminOnly, isManagerOrAdmin } from '@/lib/shared/roles'
import { formatClock, money } from '@/features/pos/format'
import type { Product, Shift, UserSession } from '@/features/pos/types'
import { useTheme, type Theme } from '@/hooks/use-theme'

interface PricingStatus {
  count: number
  activeCount?: number
}

interface ThemeOption {
  value: Theme
  label: string
  Icon: LucideIcon
}

const themeOptions: ThemeOption[] = [
  { value: 'light', label: 'Sáng', Icon: Sun },
  { value: 'dark', label: 'Tối', Icon: Moon },
  { value: 'system', label: 'Hệ thống', Icon: Monitor },
]

export function MoreScreen() {
  const router = useRouter()
  const { success: notifySuccess, error: notifyError } = useToast()
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const [parkingFeeValue, setParkingFeeValue] = useState('')
  const [parkingFeeSaving, setParkingFeeSaving] = useState(false)

  const PARKING_FEE_KEY = 'PARKING_FEE_UNIT_PRICE'

  const { data: userData, isLoading: userLoading } = useApi<UserSession>('/api/auth/me', { dedupingInterval: 600_000 })
  const { data: shiftData, isLoading: shiftLoading } = useApi<Shift | null>('/api/shifts?current=true', { dedupingInterval: 60_000 })
  const { data: pricingData } = useApi<PricingStatus>('/api/pricing/status', { dedupingInterval: 300_000 })
  const { data: productData } = useApi<Product[]>('/api/products?isActive=true', { dedupingInterval: 300_000 })
  const { data: parkingFeeData } = useApi<{ key: string; value: string; label: string | null }>(
    `/api/settings?key=${PARKING_FEE_KEY}`,
    { dedupingInterval: 300_000 }
  )

  const user = userData?.data ?? null
  const shift = shiftData?.data ?? null
  const pricingCount = pricingData?.data?.count ?? 0
  const activePricingCount = pricingData?.data?.activeCount ?? pricingData?.data?.count ?? 0
  const products = productData?.data ?? []
  const loading = userLoading || shiftLoading
  const error = !userData?.success ? (userData?.error as string ?? '') : ''

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true)
  }, [])

  const isAdmin = isAdminOnly(user?.role)
  const canViewShifts = isManagerOrAdmin(user?.role)
  const coreLinks = [
    ...(canViewShifts
      ? [{ href: '/shifts', label: 'Ca làm', description: 'Lịch sử và nhân viên ca', Icon: CalendarClock, tone: 'blue' as const }]
      : []),
    { href: '/customers', label: 'Hội viên', description: 'Đăng ký và gia hạn', Icon: ShieldCheck, tone: 'purple' },
    { href: '/insventory', label: 'Kho quầy', description: 'Xem tồn và hàng sắp hết', Icon: Package, tone: 'amber' },
    ...(isAdmin
      ? [{ href: '/reports', label: 'Báo cáo', description: 'Đối soát ca và ngày', Icon: BarChart3, tone: 'blue' as const }]
      : []),
  ] as const

  const adminLinks = [
    { href: '/pricing', label: 'Bảng giá', description: 'Giá giờ chơi vãng lai', Icon: Banknote },
    { href: '/promotions', label: 'Khuyến mại', description: 'Giảm giá giờ chơi vãng lai', Icon: Tag },
    { href: '/membership-plans', label: 'Gói hội viên', description: 'Phí tháng và thời hạn gói', Icon: Ticket },
    { href: '/students', label: 'Học viên', description: 'Quản lý học viên và lịch học', Icon: GraduationCap },
    { href: '/staff', label: 'Nhân viên', description: 'Tài khoản và phân quyền', Icon: UserCog },
    { href: '/tools', label: 'Dụng cụ', description: 'Công cụ hệ thống', Icon: Wrench },
    { href: '/cashflow', label: 'Thu chi', description: 'Theo dõi thu nhập và chi phí', Icon: ArrowRightLeft },
  ] as const

  const handleLogout = async () => {
    setLoggingOut(true)
    try {
      const data = await apiJson<{ success: boolean; error?: string }>('/api/auth/logout', { method: 'POST' })
      if (!data.success) {
        notifyError(data.error || 'Không đăng xuất được')
        return
      }
      notifySuccess('Đã đăng xuất')
      router.replace('/login')
    } catch {
      notifyError('Lỗi kết nối máy chủ')
    } finally {
      setLoggingOut(false)
    }
  }

  const handleSaveParkingFee = async () => {
    setParkingFeeSaving(true)
    try {
      const data = await apiJson<{ key: string; value: string }>(
        '/api/settings',
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            key: PARKING_FEE_KEY,
            value: parkingFeeValue,
            label: 'Phí gửi xe (VNĐ/xe)',
          }),
        }
      )
      if (!data.success) {
        notifyError(data.error || 'Không lưu được phí gửi xe')
        return
      }
      notifySuccess('Đã cập nhật phí gửi xe')
    } catch {
      notifyError('Lỗi kết nối máy chủ')
    } finally {
      setParkingFeeSaving(false)
    }
  }

  if (loading) {
    return <MoreSkeleton />
  }

  return (
    <div className="min-h-full bg-zinc-50 px-4 py-4 dark:bg-zinc-950 md:px-6 md:py-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <header className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="hidden text-2xl font-bold text-zinc-950 dark:text-white md:block">
              Thêm
            </h1>
          </div>
          <Button
            variant="secondary"
            size="sm"
            icon={RefreshCw}
            onClick={() => { /* SWR auto-refresh on focus */ }}
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

        <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="grid grid-cols-[6px_1fr]">
            <div className={shift ? 'bg-emerald-500' : 'bg-amber-500'} />
            <div className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-zinc-950 dark:text-white">
                    {user?.fullName ?? 'Tài khoản'}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                    {user?.username ?? ''}
                    {user ? ` · ${user.role === 'ADMIN' ? 'Quản trị viên' : user.role === 'MANAGER' ? 'Quản lý' : 'Nhân viên'}` : ''}
                  </p>
                </div>
                <Badge variant={isAdmin ? 'purple' : 'default'}>
                  {user?.role === 'ADMIN' ? 'Admin' : user?.role === 'MANAGER' ? 'QL' : 'Staff'}
                </Badge>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <MiniStatus
                  label={shift ? 'Ca đang mở' : 'Chưa mở ca'}
                  value={shift ? formatClock(shift.openedAt) : 'Cần mở ca'}
                  tone={shift ? 'success' : 'warning'}
                />
                <MiniStatus
                  label="Tiền đầu ca"
                  value={shift ? money(shift.openingCash) : money(0)}
                  tone="default"
                />
              </div>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <HealthCard
            good={!!shift}
            title={shift ? 'Ca làm sẵn sàng' : 'Chưa mở ca'}
            description={shift ? 'POS có thể check-in và thu tiền.' : 'Nhân viên cần mở ca trước khi vận hành POS.'}
            href="/sessions"
          />
          <HealthCard
            good={activePricingCount > 0}
            title={activePricingCount > 0 ? 'Đã có giá hiệu lực' : 'Thiếu giá hiệu lực'}
            description={
              activePricingCount > 0
                ? `${activePricingCount}/${pricingCount} quy tắc đang áp dụng lúc này.`
                : 'Khách vãng lai cần quy tắc giá hiệu lực trước khi check-in.'
            }
            href={isAdmin ? '/pricing' : undefined}
          />
        </section>

        {isAdmin && (
          <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <SectionTitle title="Quản trị" />
            <div className="mt-3 space-y-2">
              {adminLinks.map((item) => (
                <AdminLink key={item.href} {...item} />
              ))}
            </div>

            <ParkingFeeConfig
              value={parkingFeeValue}
              saving={parkingFeeSaving}
              onChange={setParkingFeeValue}
              onSave={handleSaveParkingFee}
            />
          </section>
        )}

        <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <SectionTitle title="Lối tắt vận hành" />
          <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-5">
            {coreLinks.map((item) => (
              <ShortcutCard key={item.href} {...item} />
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <SectionTitle title="Giao diện" />
          {!mounted ? (
            <div className="mt-3 grid grid-cols-3 gap-2">
              <Skeleton className="h-11" />
              <Skeleton className="h-11" />
              <Skeleton className="h-11" />
            </div>
          ) : (
            <div className="mt-3 grid grid-cols-3 gap-2">
              {themeOptions.map((option) => {
                const active = theme === option.value
                const { Icon } = option
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setTheme(option.value)}
                    className={`flex min-h-11 items-center justify-center gap-2 rounded-lg border px-2 text-xs font-medium transition-colors ${
                      active
                        ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300'
                        : 'border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800'
                    }`}
                  >
                    <Icon size={16} />
                    <span>{option.label}</span>
                  </button>
                )
              })}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <Button
            variant="outline-danger"
            size="lg"
            fullWidth
            icon={LogOut}
            loading={loggingOut}
            disabled={loggingOut}
            onClick={handleLogout}
          >
            {loggingOut ? 'Đang đăng xuất...' : 'Đăng xuất'}
          </Button>
        </section>
      </div>
    </div>
  )
}

function MoreSkeleton() {
  return (
    <div className="space-y-4 p-4 md:p-6">
      <Skeleton className="h-10 w-32" />
      <Skeleton className="h-32 w-full" />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </div>
      <Skeleton className="h-48 w-full" />
    </div>
  )
}

function SectionTitle({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-2">
      <Settings size={16} className="text-zinc-400" />
      <h2 className="text-sm font-semibold text-zinc-950 dark:text-white">{title}</h2>
    </div>
  )
}

function MiniStatus({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: 'success' | 'warning' | 'default'
}) {
  const valueClass = tone === 'success'
    ? 'text-emerald-600 dark:text-emerald-300'
    : tone === 'warning'
      ? 'text-amber-600 dark:text-amber-300'
      : 'text-zinc-950 dark:text-white'

  return (
    <div className="rounded-lg bg-zinc-50 px-3 py-2 dark:bg-zinc-950">
      <p className="text-[11px] text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className={`mt-1 text-sm font-semibold tabular-nums ${valueClass}`}>
        {value}
      </p>
    </div>
  )
}

function HealthCard({
  good,
  title,
  description,
  href,
}: {
  good: boolean
  title: string
  description: string
  href?: string
}) {
  const content = (
    <div className={`flex items-start gap-3 rounded-xl border p-3 ${
      good
        ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300'
        : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300'
    }`}
    >
      {good ? <CheckCircle2 size={18} className="mt-0.5 shrink-0" /> : <AlertCircle size={18} className="mt-0.5 shrink-0" />}
      <div className="min-w-0">
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-0.5 text-xs opacity-90">{description}</p>
      </div>
      {href && <ArrowRight size={16} className="ml-auto mt-1 shrink-0" />}
    </div>
  )

  return href ? <Link href={href}>{content}</Link> : content
}

function ShortcutCard({
  href,
  label,
  description,
  Icon,
  tone,
}: {
  href: string
  label: string
  description: string
  Icon: LucideIcon
  tone: 'emerald' | 'purple' | 'amber' | 'blue'
}) {
  const toneClasses = {
    emerald: 'text-emerald-600 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-500/10',
    purple: 'text-purple-600 bg-purple-50 dark:text-purple-300 dark:bg-purple-500/10',
    amber: 'text-amber-600 bg-amber-50 dark:text-amber-300 dark:bg-amber-500/10',
    blue: 'text-blue-600 bg-blue-50 dark:text-blue-300 dark:bg-blue-500/10',
  }[tone]

  return (
    <Link
      href={href}
      className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 transition-colors hover:bg-white dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-900"
    >
      <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${toneClasses}`}>
        <Icon size={18} />
      </div>
      <p className="mt-3 text-sm font-semibold text-zinc-950 dark:text-white">{label}</p>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{description}</p>
    </Link>
  )
}

function AdminLink({
  href,
  label,
  description,
  Icon,
}: {
  href: string
  label: string
  description: string
  Icon: LucideIcon
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 px-3 py-3 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800"
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
          <Icon size={17} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-zinc-950 dark:text-white">{label}</p>
          <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">{description}</p>
        </div>
      </div>
      <ArrowRight size={16} className="shrink-0 text-zinc-400" />
    </Link>
  )
}

function ParkingFeeConfig({
  value,
  saving,
  onChange,
  onSave,
}: {
  value: string
  saving: boolean
  onChange: (value: string) => void
  onSave: () => void
}) {
  const numericValue = Number(value) || 0

  return (
    <div className="mt-4 space-y-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <div className="flex items-center gap-2">
        <Car size={16} className="text-zinc-500 dark:text-zinc-400" />
        <Label htmlFor="parking-fee" className="text-sm font-medium text-zinc-950 dark:text-white">
          Phí gửi xe
        </Label>
      </div>
      <div className="flex items-center gap-2">
        <Input
          id="parking-fee"
          type="number"
          min={0}
          step={1000}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="0"
          className="flex-1"
        />
        <span className="text-sm text-zinc-500 dark:text-zinc-400">VNĐ/xe</span>
      </div>
      {numericValue > 0 && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Phí gửi xe sẽ được trừ vào tổng thanh toán tại checkout. Hiện tại: {money(numericValue)}/xe
        </p>
      )}
      <Button
        variant="primary"
        size="sm"
        loading={saving}
        disabled={saving || Number(value) < 0}
        onClick={onSave}
      >
        {saving ? 'Đang lưu...' : 'Lưu cấu hình'}
      </Button>
    </div>
  )
}
