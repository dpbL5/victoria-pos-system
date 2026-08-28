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
  CalendarClock,
  Car,
  CheckCircle2,
  GraduationCap,
  LogOut,
  Monitor,
  Moon,
  Package,
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
import { Skeleton, SkeletonPage, SkeletonPanel } from '@/components/ui/skeleton'
import { useToast } from '@/components/ui/toast'
import { useApi } from '@/hooks/use-api'
import { apiJson } from '@/lib/api'
import { isAdminOnly, isManagerOrAdmin } from '@/lib/shared/roles'
import { formatClock, money } from '@/features/pos/format'
import type { Shift, UserSession } from '@/features/pos/types'
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

  const { data: userData, isLoading: userLoading } = useApi<UserSession>('/api/auth/me', {
    dedupingInterval: 600_000,
    revalidateOnFocus: false,
  })
  const { data: shiftData, isLoading: shiftLoading } = useApi<Shift | null>('/api/shifts?current=true', {
    dedupingInterval: 60_000,
    revalidateOnFocus: false,
  })
  const { data: pricingData } = useApi<PricingStatus>('/api/pricing/status', {
    dedupingInterval: 300_000,
    revalidateOnFocus: false,
  })
  const { data: parkingFeeData } = useApi<{ key: string; value: string; label: string | null }>(
    `/api/settings?key=${PARKING_FEE_KEY}`,
    { dedupingInterval: 300_000, revalidateOnFocus: false }
  )

  const user = userData?.data ?? null
  const shift = shiftData?.data ?? null
  const pricingCount = pricingData?.data?.count ?? 0
  const activePricingCount = pricingData?.data?.activeCount ?? pricingData?.data?.count ?? 0
  const loading = userLoading || shiftLoading
  const error = !userData?.success ? (userData?.error as string ?? '') : ''

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true)
  }, [])

  useEffect(() => {
    if (parkingFeeData?.data && !parkingFeeValue) {
      setParkingFeeValue(parkingFeeData.data.value)
    }
  }, [parkingFeeData, parkingFeeValue])

  const isAdmin = isAdminOnly(user?.role)
  const canViewShifts = isManagerOrAdmin(user?.role)
  const coreLinks = [
    ...(canViewShifts
      ? [{ href: '/shifts', label: 'Ca làm', Icon: CalendarClock, tone: 'blue' as const }]
      : []),
    { href: '/customers', label: 'Hội viên', Icon: ShieldCheck, tone: 'purple' },
    ...(!canViewShifts
      ? [{ href: '/inventory', label: 'Kho quầy', Icon: Package, tone: 'amber' as const }]
      : []),
  ] as const

  const adminLinks = [
    { href: '/customers', label: 'Hội viên', Icon: ShieldCheck, tone: 'purple' as const },
    { href: '/membership-plans', label: 'Gói hội viên', Icon: Ticket, tone: 'purple' as const },
    { href: '/promotions', label: 'Khuyến mại', Icon: Tag, tone: 'purple' as const },
    { href: '/shifts', label: 'Ca làm', Icon: CalendarClock, tone: 'blue' as const },
    { href: '/staff', label: 'Nhân viên', Icon: UserCog, tone: 'blue' as const },
    { href: '/pricing', label: 'Bảng giá', Icon: Banknote, tone: 'blue' as const },
    { href: '/tools', label: 'Dụng cụ', Icon: Wrench, tone: 'amber' as const },
    { href: '/students', label: 'Học viên', Icon: GraduationCap, tone: 'emerald' as const },
    { href: '/cashflow', label: 'Thu chi', Icon: ArrowRightLeft, tone: 'emerald' as const },
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
        </header>

        {error && (
          <NoticeCard
            tone="danger"
            title="Không tải được dữ liệu"
            description={error}
          />
        )}

        <section className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-zinc-950 dark:text-white">
                {user?.fullName ?? 'Tài khoản'}
              </p>
              <p className="mt-1 truncate text-xs text-zinc-500 dark:text-zinc-400">
                {user?.username ?? ''}
                {user ? ` · ${user.role === 'ADMIN' ? 'Quản trị viên' : user.role === 'MANAGER' ? 'Quản lý' : 'Nhân viên'}` : ''}
              </p>
            </div>
            <Badge variant={isAdmin ? 'purple' : 'default'}>
              {user?.role === 'ADMIN' ? 'Admin' : user?.role === 'MANAGER' ? 'QL' : 'Staff'}
            </Badge>
          </div>
          <p className={`mt-3 text-xs font-medium ${shift ? 'text-emerald-600 dark:text-emerald-300' : 'text-amber-600 dark:text-amber-300'}`}>
            {shift ? `Ca đang mở · ${formatClock(shift.openedAt)}` : 'Chưa mở ca'}
          </p>
        </section>

        <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <SectionTitle title="Lối tắt" />
          <div className="motion-stagger mt-3 grid grid-cols-3 gap-2">
            {(isAdmin ? adminLinks : coreLinks).map((item) => (
              <ShortcutCard key={item.href} {...item} />
            ))}
          </div>
        </section>

        <section>
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
            <SectionTitle title="Cấu hình hệ thống" />
            <ParkingFeeConfig
              value={parkingFeeValue}
              saving={parkingFeeSaving}
              onChange={setParkingFeeValue}
              onSave={handleSaveParkingFee}
            />
          </section>
        )}

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
    <SkeletonPage maxWidth="max-w-5xl">
      <Skeleton className="h-10 w-32" />
      <SkeletonPanel><Skeleton className="h-24 w-full" /></SkeletonPanel>
      <SkeletonPanel>
        <div className="grid grid-cols-3 gap-2">
          {Array.from({ length: 9 }, (_, index) => <Skeleton key={index} className="h-20" />)}
        </div>
      </SkeletonPanel>
      <Skeleton className="h-16 w-full" />
      <SkeletonPanel><Skeleton className="h-48 w-full" /></SkeletonPanel>
      <SkeletonPanel><Skeleton className="h-11 w-full" /></SkeletonPanel>
    </SkeletonPage>
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
  Icon,
  tone,
}: {
  href: string
  label: string
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
      className="motion-hover-lift flex min-h-24 flex-col items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-center hover:bg-white dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-900"
    >
      <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${toneClasses}`}>
        <Icon size={18} />
      </div>
      <p className="mt-2 text-xs font-semibold text-zinc-950 dark:text-white">{label}</p>
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
