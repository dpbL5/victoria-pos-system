"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowRightLeft,
  Banknote,
  BarChart3,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Clock,
  GraduationCap,
  Package,
  School,
  Settings,
  ShieldCheck,
  Tag,
  Timer,
  UserCog,
  Users,
  BowArrow,
  type LucideIcon,
} from "lucide-react";
import { useCallback } from "react";
import { Logo } from "@/components/ui/logo";
import { canAccessTraining, isAdminOnly } from "@/lib/shared/roles";

interface MenuItem {
  href: string;
  label: string;
  Icon: LucideIcon;
  adminOnly?: boolean;
  staffHidden?: boolean;
  trainingOnly?: boolean;
  /** Mọi role đều thấy (kể cả TEACHER, vốn chỉ mở module Đào tạo) */
  alwaysVisible?: boolean;
}

interface MenuGroup {
  label: string;
  items: MenuItem[];
}

export const menuGroups: MenuGroup[] = [
  {
    label: "Vận hành",
    items: [
      { href: "/sessions", label: "Ca hôm nay", Icon: Timer },
      { href: "/bookings", label: "Đặt Lịch", Icon: CalendarClock },
      {
        href: "/shifts",
        label: "Ca làm",
        Icon: Clock,
        staffHidden: true,
      },
      {
        href: "/cashflow",
        label: "Thu chi",
        Icon: ArrowRightLeft,
        adminOnly: true,
      },
    ],
  },
  {
    label: "Khách hàng",
    items: [{ href: "/customers", label: "Hội viên", Icon: ShieldCheck }],
  },
  {
    label: "Kho",
    items: [
      { href: "/inventory", label: "Kho", Icon: Package, staffHidden: true },
      { href: "/tools", label: "Dụng cụ", Icon: BowArrow, adminOnly: true },
    ],
  },
  {
    label: "Đào tạo",
    items: [
      {
        href: "/lessons",
        label: "Lịch học",
        Icon: GraduationCap,
        adminOnly: true,
        trainingOnly: true,
      },
      { href: "/classes", label: "Lớp học", Icon: School, adminOnly: true, trainingOnly: true },
      { href: "/students", label: "Học viên", Icon: Users, adminOnly: true, trainingOnly: true },
    ],
  },
  {
    label: "Quản trị",
    items: [
      { href: "/reports", label: "Báo cáo", Icon: BarChart3, adminOnly: true },
      { href: "/pricing", label: "Bảng giá", Icon: Banknote, adminOnly: true },
      { href: "/promotions", label: "Khuyến mại", Icon: Tag, adminOnly: true },
      { href: "/staff", label: "Nhân viên", Icon: UserCog, adminOnly: true },
    ],
  },
  {
    label: "Hệ thống",
    items: [{ href: "/settings", label: "Cài đặt", Icon: Settings, alwaysVisible: true }],
  },
];

export function getVisibleMenuGroups(userRole?: string): MenuGroup[] {
  return menuGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (userRole === "TEACHER" && !item.trainingOnly && !item.alwaysVisible) return false;
        if (item.trainingOnly && !canAccessTraining(userRole)) return false;
        if (item.adminOnly && !isAdminOnly(userRole) && userRole !== "TEACHER") return false;
        if (item.staffHidden && userRole === "STAFF") return false;
        return true;
      }),
    }))
    .filter((group) => group.items.length > 0);
}

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  userRole?: string;
}

export function Sidebar({ collapsed, onToggle, userRole }: SidebarProps) {
  const pathname = usePathname();
  const groups = getVisibleMenuGroups(userRole);

  const isActive = useCallback(
    (href: string) =>
      href === "/sessions"
        ? pathname === "/sessions" || pathname === "/"
        : pathname.startsWith(href),
    [pathname],
  );

  return (
    <aside
      className={`group fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-zinc-200 bg-white transition-all duration-200 dark:border-zinc-800 dark:bg-zinc-950 md:flex ${
        collapsed ? "w-[4.5rem]" : "w-60"
      }`}
    >
      <div
        className={`flex items-center border-b border-zinc-200 px-4 py-4 dark:border-zinc-800 ${
          collapsed ? "justify-center" : "gap-3"
        }`}
      >
    <div className={`relative shrink-0 ${collapsed ? "h-9 w-9" : "h-10 w-10"}`}>
          <Logo className="h-full w-full" />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <h1 className="truncate text-sm font-bold leading-tight tracking-wide text-zinc-900 dark:text-white">
              VICTORIA
            </h1>
          <p className="truncate text-[10px] font-medium uppercase tracking-[0.2em] text-yellow-dark dark:text-yellow">
              Archery Club
            </p>
          </div>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-3">
        {groups.map((group, index) => (
          <div key={group.label}>
            {index > 0 &&
              (collapsed ? (
                <div className="mx-auto my-2 h-px w-6 bg-zinc-200 dark:bg-zinc-800" />
              ) : (
                <div className="h-4" />
              ))}
            {!collapsed && (
              <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-400 dark:text-zinc-600">
                {group.label}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active = isActive(item.href);
                const { Icon } = item;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`motion-press flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${
                      collapsed ? "justify-center px-2" : ""
                    } ${
                      active
                      ? "bg-info-bg text-info bg-info-bg text-info"
                        : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-200"
                    }`}
                    title={collapsed ? item.label : undefined}
                  >
                    <Icon size={20} className="shrink-0" />
                    {!collapsed && <span>{item.label}</span>}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <button
        type="button"
        onClick={onToggle}
        title={collapsed ? "Mở rộng" : "Thu gọn"}
        aria-label={collapsed ? "Mở rộng thanh bên" : "Thu gọn thanh bên"}
        aria-expanded={!collapsed}
        className="absolute -right-3.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-500 opacity-0 shadow-sm transition-opacity duration-150 hover:text-zinc-900 focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
      >
        {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>
    </aside>
  );
}
