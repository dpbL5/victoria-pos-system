// ── Card primitive ─────────────────────────────────────
// Shell thẻ chuẩn của hệ thống: rounded-xl + border + surface + shadow-sm.
// Dùng cho mọi khối nội dung trong dashboard (POS, Kho, Hội viên, Báo cáo…)
// thay cho việc lặp lại class dài trong từng page.

import type { HTMLAttributes, ReactNode } from "react";

type CardPadding = "none" | "sm" | "md" | "lg";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Khoảng đệm bên trong thẻ */
  padding?: CardPadding;
  /** `interactive` — thêm hover + transition (dùng cho thẻ bấm được) */
  interactive?: boolean;
  children: ReactNode;
}

const paddingClasses: Record<CardPadding, string> = {
  none: "",
  sm: "p-3",
  md: "p-4",
  lg: "p-6",
};

export function Card({
  padding = "md",
  interactive = false,
  className = "",
  children,
  ...props
}: CardProps) {
  return (
    <div
      className={`rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900 ${
        paddingClasses[padding]
      } ${
        interactive
          ? "motion-hover-lift cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
          : ""
      } ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
