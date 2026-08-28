// ── EmptyState component ────────────────────────────────
// Dùng khi table/list không có dữ liệu

import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";

interface EmptyStateProps {
  message?: string;
  description?: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  message = "Không có dữ liệu",
  description,
  icon: Icon = Inbox,
  action,
  className = "",
}: EmptyStateProps) {
  return (
    <div className={`flex animate-fade-in flex-col items-center justify-center py-16 px-4 text-center ${className}`}>
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-100 dark:bg-zinc-800">
        <Icon className="text-zinc-300 dark:text-zinc-600" size={28} />
      </div>
      <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{message}</p>
      {description && (
        <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500 max-w-xs">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
