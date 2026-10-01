// ── Badge component ─────────────────────────────────────
// Dùng cho trạng thái (ACTIVE/COMPLETED/MAINTENANCE)
// và loại khách hàng (MEMBER/WALK_IN)

import type { ReactNode } from "react";

type BadgeVariant =
  | "success"
  | "warning"
  | "danger"
  | "purple"
  | "yellow"
  | "blue"
  | "default"
  | "outline";

type BadgeSize = "sm" | "md";

const variantStyles: Record<BadgeVariant, string> = {
  success:
    "bg-success-bg text-success border-success-border",
  warning:
    "bg-warning-bg text-warning border-warning-border",
  danger:
    "bg-danger-bg text-danger border-danger-border",
  purple:
    "bg-accent-purple-bg text-accent-purple border-accent-purple-border",
  yellow:
    "bg-yellow-bg text-yellow-dark border-yellow-border",
  blue:
    "bg-info-bg text-info border-info-border",
  default:
    "bg-surface-tertiary text-text-secondary border-border-default",
  outline:
    "bg-transparent text-text-secondary border-border-strong",
};

const sizeStyles: Record<BadgeSize, string> = {
  sm: "px-1.5 py-0 text-[10px]",
  md: "px-2 py-0.5 text-xs",
};

interface BadgeProps {
  variant?: BadgeVariant;
  size?: BadgeSize;
  children: ReactNode;
  className?: string;
}

export function Badge({
  variant = "default",
  size = "md",
  children,
  className = "",
}: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full border font-medium ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
    >
      {children}
    </span>
  );
}
