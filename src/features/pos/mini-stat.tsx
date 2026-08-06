export function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-zinc-50 px-3 py-2 dark:bg-zinc-950">
      <p className="text-[11px] text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums text-zinc-950 dark:text-white">
        {value}
      </p>
    </div>
  )
}
