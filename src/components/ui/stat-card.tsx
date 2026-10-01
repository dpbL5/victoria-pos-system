// ── StatCard component ──────────────────────────────────
// Dùng cho các card thống kê trên Dashboard và Reports
// Hỗ trợ icon, trend indicator, và các biến thể màu

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { TrendingUp, TrendingDown } from "lucide-react";

type StatColor = "green" | "blue" | "yellow" | "red" | "purple" | "default";

const colorMap: Record<StatColor, { bg: string; icon: string; dot: string }> = {
  green: {
    bg: "bg-success-bg border-success-border",
    icon: "text-success",
    dot: "bg-success",
  },
  blue: {
    bg: "bg-info-bg border-info-border",
    icon: "text-info",
    dot: "bg-info",
  },
  yellow: {
    bg: "bg-warning-bg border-warning-border",
    icon: "text-warning",
    dot: "bg-warning",
  },
  red: {
    bg: "bg-danger-bg border-danger-border",
    icon: "text-danger",
    dot: "bg-danger",
  },
  purple: {
    bg: "bg-accent-purple-bg border-accent-purple-border",
    icon: "text-accent-purple",
    dot: "bg-accent-purple",
  },
  default: {
    bg: "bg-surface-tertiary border-border-default",
    icon: "text-text-secondary",
    dot: "bg-border-strong",
  },
};

interface StatCardProps {
  label: string;
  value: string;
  color?: StatColor;
  icon?: LucideIcon;
  trend?: { value: number; label?: string };
  subtitle?: string;
  children?: ReactNode;
}

export function StatCard({
  label,
  value,
  color = "default",
  icon: Icon,
  trend,
  subtitle,
  children,
}: StatCardProps) {
  const c = colorMap[color];

  return (
    <div className={`rounded-xl border px-5 py-4 transition-shadow hover:shadow-md ${c.bg}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
            {label}
          </p>
          <p className="mt-1 text-2xl font-bold text-zinc-900 dark:text-white tracking-tight">
            {value}
          </p>
          {subtitle && (
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{subtitle}</p>
          )}
          {trend && (
            <div className="mt-1.5 flex items-center gap-1">
              {trend.value > 0 ? (
              <TrendingUp size={14} className="text-success" />
              ) : (
              <TrendingDown size={14} className="text-danger" />
              )}
              <span
                className={`text-xs font-medium ${
                  trend.value > 0
                  ? "text-success"
                  : "text-danger"
                }`}
              >
                {trend.value > 0 ? "+" : ""}
                {trend.value}%
              </span>
              {trend.label && (
                <span className="text-xs text-zinc-400">{trend.label}</span>
              )}
            </div>
          )}
        </div>
        {Icon && (
        <div className={`shrink-0 rounded-lg bg-surface-elevated p-2 ${c.icon}`}>
            <Icon size={20} />
          </div>
        )}
      </div>
      {children}
    </div>
  );
}
