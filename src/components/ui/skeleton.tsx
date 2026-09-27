// ── Shared screen-level loading state ────────────────────

import Image from 'next/image'

export function AppSkeleton() {
  return (
    <div className="flex min-h-full items-center justify-center bg-zinc-50 p-6 dark:bg-zinc-950" role="status" aria-label="Đang tải">
      <Image src="/logo.jpg" alt="" width={80} height={80} priority className="app-skeleton-logo rounded-2xl object-cover shadow-sm" />
    </div>
  )
}
