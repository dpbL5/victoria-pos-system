// ── Shared screen-level loading state ────────────────────

import { Logo } from './logo'

export function AppSkeleton() {
  return (
    <div className="flex min-h-full items-center justify-center bg-surface-secondary p-6" role="status" aria-label="Đang tải">
      <Logo className="app-skeleton-logo h-20 w-20" />
    </div>
  )
}
