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
  ? 'tabular-nums text-danger'
    : 'tabular-nums text-zinc-950 dark:text-white'
  const labelClass = strong
    ? 'text-zinc-950 dark:text-white'
    : warning
    ? 'text-danger'
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
