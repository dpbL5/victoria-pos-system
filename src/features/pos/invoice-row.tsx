export function InvoiceRow({
  label,
  value,
  strong,
  warning,
}: {
  label: string
  value: string
  strong?: boolean
  warning?: boolean
}) {
  const valueClass = warning
    ? 'tabular-nums text-red-600 dark:text-red-300'
    : 'tabular-nums text-zinc-950 dark:text-white'
  const labelClass = strong
    ? 'text-zinc-950 dark:text-white'
    : warning
      ? 'text-red-500 dark:text-red-300'
      : 'text-zinc-500 dark:text-zinc-400'

  return (
    <div className={`flex justify-between gap-3 text-sm ${strong ? 'font-semibold' : ''}`}>
      <span className={labelClass}>
        {label}
      </span>
      <span className={valueClass}>
        {value}
      </span>
    </div>
  )
}
