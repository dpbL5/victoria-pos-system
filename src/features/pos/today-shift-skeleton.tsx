import { Skeleton, SkeletonPanel, SkeletonPage } from '@/components/ui/skeleton'

export function TodayShiftSkeleton() {
  return (
    <SkeletonPage maxWidth="max-w-5xl">
      {/* ShiftRail — header gọn + stats 3 cột + action bar 2 cột */}
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="grid grid-cols-[8px_1fr]">
          <div className="bg-emerald-500/40" aria-hidden />
          <div className="space-y-3 p-4">
            <Skeleton className="h-5 w-40" />
            <div className="grid grid-cols-3 gap-2">
              <Skeleton className="h-16" />
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
            </div>
            <div className="grid grid-cols-2 gap-2 md:flex md:flex-wrap md:justify-end">
              <Skeleton className="h-9 md:w-32" />
              <Skeleton className="h-9 md:w-28" />
              <Skeleton className="h-9 md:w-28" />
              <Skeleton className="h-9 md:w-24" />
            </div>
          </div>
        </div>
      </div>

      {/* QuickActions — 3 ô ngang hàng */}
      <div className="grid grid-cols-3 gap-2">
        <SkeletonPanel><Skeleton className="h-14 w-full" /></SkeletonPanel>
        <SkeletonPanel><Skeleton className="h-14 w-full" /></SkeletonPanel>
        <SkeletonPanel><Skeleton className="h-14 w-full" /></SkeletonPanel>
      </div>

      {/* Sessions section — header + 2 dòng card */}
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-32" />
          </div>
        </div>
        <Skeleton className="h-16 w-full rounded-none" />
        <Skeleton className="h-16 w-full rounded-none" />
      </div>
    </SkeletonPage>
  )
}
