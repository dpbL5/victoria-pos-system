export function MiniStat({
  label,
  value,
  variant = 'default',
}: {
  label: string
  value: number
  variant?: 'default' | 'accent'
}) {
  const isAccent = variant === 'accent'
  return (
    <div
      className={
        isAccent
          ? 'rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 dark:border-emerald-500/20 dark:bg-emerald-500/10'
          : 'rounded-lg bg-zinc-50 px-3 py-2 dark:bg-zinc-950'
      }
    >
      <p className="text-[11px] text-zinc-500 dark:text-zinc-400">{label}</p>
      <p
        className={
          isAccent
            ? 'mt-0.5 text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-300'
            : 'mt-0.5 text-lg font-semibold tabular-nums text-zinc-950 dark:text-white'
        }
      >
        {value}
      </p>
    </div>
  )
}
