"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { mutate as clearSWRCache } from "swr";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRightLeft,
  Banknote,
  BowArrow,
  CalendarClock,
  Car,
  GraduationCap,
  LogOut,
  Monitor,
  Moon,
  School,
  Settings,
  ShieldCheck,
  Sun,
  Tag,
  Ticket,
  UserCog,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { NoticeCard } from "@/components/ui/notice-card";
import { AppSkeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { useApi } from "@/hooks/use-api";
import { apiJson } from "@/lib/api";
import { getRoleLabel, isAdminOnly, isManagerOrAdmin } from "@/lib/shared/roles";
import { formatClock, money } from "@/features/pos/format";
import type { Shift, UserSession } from "@/features/pos/types";
import { CalendarConnection } from "@/features/students/calendar-connection";
import { useTheme, type Theme } from "@/hooks/use-theme";
import { PAGE_TITLE_CLASS } from '@/components/ui/page-title'

interface ThemeOption {
  value: Theme;
  label: string;
  Icon: LucideIcon;
}

const themeOptions: ThemeOption[] = [
  { value: "light", label: "Sáng", Icon: Sun },
  { value: "dark", label: "Tối", Icon: Moon },
  { value: "system", label: "Hệ thống", Icon: Monitor },
];

export function MoreScreen() {
  const router = useRouter();
  const { success: notifySuccess, error: notifyError } = useToast();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [parkingFeeValue, setParkingFeeValue] = useState("");
  const [parkingFeeSaving, setParkingFeeSaving] = useState(false);

  const PARKING_FEE_KEY = "PARKING_FEE_UNIT_PRICE";

  const { data: userData, isLoading: userLoading } = useApi<UserSession>(
    "/api/auth/me",
    {
      dedupingInterval: 600_000,
      revalidateOnFocus: false,
    },
  );
  const user = userData?.data ?? null;
  const role = user?.role;
  const isAdmin = isAdminOnly(role);
  const isTeacher = role === "TEACHER";

  // Chờ đọc xong role rồi mới quyết định gọi API. Giáo viên không trực quầy và
  // proxy chặn ngoài module Đào tạo — gọi sớm sẽ ăn 403 ngay lần render đầu.
  const canLoadShift = !!role && !isTeacher;
  const { data: shiftData, isLoading: shiftLoading } = useApi<Shift | null>(
    canLoadShift ? "/api/shifts?current=true" : null,
    {
      dedupingInterval: 60_000,
      revalidateOnFocus: false,
    },
  );
  const { data: parkingFeeData } = useApi<{
    key: string;
    value: string;
    label: string | null;
  }>(isAdmin ? `/api/settings?key=${PARKING_FEE_KEY}` : null, {
    dedupingInterval: 300_000,
    revalidateOnFocus: false,
  });

  const shift = shiftData?.data ?? null;
  const loading = userLoading || shiftLoading;
  const error = !userData?.success ? ((userData?.error as string) ?? "") : "";

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  useEffect(() => {
    if (parkingFeeData?.data && !parkingFeeValue) {
      setParkingFeeValue(parkingFeeData.data.value);
    }
  }, [parkingFeeData, parkingFeeValue]);

  const canViewShifts = isManagerOrAdmin(user?.role);
  const coreLinks = [
    {
      href: "/bookings",
      label: "Đặt Lịch",
      Icon: CalendarClock,
    },
    ...(canViewShifts
      ? [
        {
            href: "/shifts",
            label: "Ca làm",
            Icon: CalendarClock,
          },
        ]
      : []),
    {
      href: "/customers",
      label: "Hội viên",
      Icon: ShieldCheck,
    },
  ] as const;

  const adminLinks = [
    {
      href: "/pricing",
      label: "Bảng giá",
      Icon: Banknote,
    },
    {
      href: "/promotions",
      label: "Khuyến mại",
      Icon: Tag,
    },
    {
      href: "/tools",
      label: "Dụng cụ",
      Icon: BowArrow,
    },
    {
      href: "/staff",
      label: "Nhân viên",
      Icon: UserCog,
    },
    {
      href: "/membership-plans",
      label: "Gói hội viên",
      Icon: Ticket,
    },
    {
      href: "/bookings",
      label: "Đặt Lịch",
      Icon: CalendarClock,
    },
    {
      href: "/customers",
      label: "Hội viên",
      Icon: ShieldCheck,
    },
    {
      href: "/shifts",
      label: "Ca làm",
      Icon: CalendarClock,
    },
    {
      href: "/cashflow",
      label: "Thu chi",
      Icon: ArrowRightLeft,
    },
    {
      href: "/lessons",
      label: "Lịch học",
      Icon: GraduationCap,
    },
    {
      href: "/classes",
      label: "Lớp học",
      Icon: School,
    },
    {
      href: "/students",
      label: "Học viên",
      Icon: Users,
    },
  ] as const;

  // Giáo viên chỉ mở được module Đào tạo — lối tắt vận hành sẽ bị proxy đưa về
  // `/lessons`, nên tab `Thêm` của họ chỉ liên kết 3 màn đào tạo.
  const teacherLinks = [
    {
      href: "/lessons",
      label: "Lịch học",
      Icon: GraduationCap,
    },
    {
      href: "/classes",
      label: "Lớp học",
      Icon: School,
    },
    {
      href: "/students",
      label: "Học viên",
      Icon: Users,
    },
  ] as const;

  const shortcutLinks = isAdmin
    ? adminLinks
    : isTeacher
      ? teacherLinks
      : coreLinks;

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      const data = await apiJson<{ success: boolean; error?: string }>(
        "/api/auth/logout",
        { method: "POST" },
      );
      if (!data.success) {
        notifyError(data.error || "Không đăng xuất được");
        return;
      }
      await clearSWRCache(() => true, undefined, { revalidate: false });
      notifySuccess("Đã đăng xuất");
      router.replace("/login");
    } catch {
      notifyError("Lỗi kết nối máy chủ");
    } finally {
      setLoggingOut(false);
    }
  };

  const handleSaveParkingFee = async () => {
    setParkingFeeSaving(true);
    try {
      const data = await apiJson<{ key: string; value: string }>(
        "/api/settings",
          {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            key: PARKING_FEE_KEY,
            value: parkingFeeValue,
            label: "Phí gửi xe (VNĐ/xe)",
          }),
        },
      );
      if (!data.success) {
        notifyError(data.error || "Không lưu được phí gửi xe");
        return;
      }
      notifySuccess("Đã cập nhật phí gửi xe");
    } catch {
      notifyError("Lỗi kết nối máy chủ");
    } finally {
      setParkingFeeSaving(false);
    }
  };

  if (loading) {
    return <AppSkeleton />;
  }

  return (
    <div className="min-h-full bg-zinc-50 px-4 py-4 dark:bg-zinc-950 md:px-6 md:py-6">
      <div className="mx-auto max-w-content space-y-4">
        <header className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className={`hidden md:block ${PAGE_TITLE_CLASS}`}>
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
              <p className="truncate text-2xl font-semibold text-zinc-950 dark:text-white">
                {user?.fullName ?? "Tài khoản"}
              </p>
              <p className="mt-1 truncate text-xs text-zinc-500 dark:text-zinc-400">
                {user?.username ?? ""}
                {user
                ? ` · ${getRoleLabel(user.role)}`
                  : ""}
              </p>
            </div>
            <Badge variant={isAdmin ? "purple" : "default"}>
              {user?.role === "ADMIN"
                ? "Admin"
                : user?.role === "MANAGER"
                  ? "QL"
                  : user?.role === "TEACHER"
                  ? "GV"
                  : "Staff"}
            </Badge>
          </div>
          {/* Giáo viên không trực ca quầy nên không hiện trạng thái ca */}
          {!isTeacher && (
            <p
              className={`mt-3 text-xs font-medium ${shift ? "text-success" : "text-warning"}`}
            >
              {shift
                ? `Ca đang mở · ${formatClock(shift.openedAt)}`
                : "Chưa mở ca"}
              </p>
          )}
          </section>

        <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <SectionTitle title="Lối tắt" />
          <div className="mt-2 grid grid-cols-4 gap-1 sm:gap-2">
            {(shortcutLinks.map((item, index) => (
              <ShortcutCard key={item.href} index={index} {...item} />
            )))}
          </div>
        </section>

        {isAdmin && (
        <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <SectionTitle title="Google Calendar" />
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
              Kết nối tài khoản Google của bạn để đồng bộ lịch học lên Google
              Calendar.
          </p>
            <div className="mt-3">
              <CalendarConnection />
            </div>
          </section>
        )}

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
          {mounted && (
            <div className="mt-3 grid grid-cols-3 gap-2">
              {themeOptions.map((option) => {
                const active = theme === option.value;
                const { Icon } = option;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setTheme(option.value)}
                    className={`flex min-h-11 items-center justify-center gap-2 rounded-lg border px-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-primary ${
                      active
                      ? "border-info-border bg-info-bg text-info"
                        : "border-border-default bg-surface-elevated text-text-secondary hover:bg-surface-tertiary"
                    }`}
                    aria-pressed={active}
                  >
                    <Icon size={16} />
                    <span>{option.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

          <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <Button
            variant="red"
            size="lg"
            fullWidth
            icon={LogOut}
            loading={loggingOut}
            disabled={loggingOut}
            onClick={handleLogout}
          >
            {loggingOut ? "Đang đăng xuất..." : "Đăng xuất"}
          </Button>
        </section>
      </div>
    </div>
  );
}

function SectionTitle({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-2">
      <Settings size={16} className="text-zinc-400" />
      <h2 className="text-sm font-semibold text-zinc-950 dark:text-white">
        {title}
      </h2>
    </div>
  );
}

function ShortcutCard({
  href,
  label,
  Icon,
  index,
}: {
  href: string;
  label: string;
  Icon: LucideIcon;
  index: number;
}) {
  // Ô icon kiểu app icon: nền nhạt + icon đậm. Mọi lối tắt dùng chung MỘT màu —
  // vàng brand (`--color-yellow`). Trên nền sáng icon phải là bước đậm
  // `text-yellow-dark` (#8a6a00, 4.77:1 trên nền tint); ở dark token này chính
  // là #ffd444 nên cùng một class đúng cho cả hai theme.
  return (
    <Link
      href={href}
      style={{ animationDelay: `${index * 35}ms` }}
      className="group animate-card-enter flex flex-col items-center gap-1.5 rounded-2xl px-1 py-2 text-center transition-transform active:scale-[0.94]"
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-yellow-bg text-yellow-dark transition-colors group-hover:bg-yellow-border">
        <Icon size={24} strokeWidth={1.85} aria-hidden />
      </span>
      <span className="text-xs font-medium leading-tight text-text-secondary">
        {label}
      </span>
    </Link>
  );
}

function ParkingFeeConfig({
  value,
  saving,
  onChange,
  onSave,
}: {
  value: string;
  saving: boolean;
  onChange: (value: string) => void;
  onSave: () => void;
}) {
  const numericValue = Number(value) || 0;

  return (
    <div className="mt-4 space-y-3">
      <div className="flex items-center gap-2">
        <Car size={16} className="text-zinc-500 dark:text-zinc-400" />
        <Label
          htmlFor="parking-fee"
          className="text-sm font-medium text-zinc-950 dark:text-white"
        >
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
          Hiện tại: {money(numericValue)}/xe
        </p>
        )}
      <Button
        variant="contrast"
        size="sm"
        loading={saving}
        disabled={saving || Number(value) < 0}
        onClick={onSave}
      >
        {saving ? "Đang lưu..." : "Lưu cấu hình"}
      </Button>
    </div>
  );
}
