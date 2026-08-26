import { LogIn, Package, ShoppingCart } from 'lucide-react'

export function QuickActions({
  shiftReady,
  retailDisabled = false,
  onCheckIn,
  onSell,
  onRetail,
}: {
  shiftReady: boolean
  retailDisabled?: boolean
  onCheckIn: () => void
  onSell: () => void
  onRetail: () => void
}) {
  const actions = [
    { label: 'Check-in', Icon: LogIn, onClick: onCheckIn, tone: 'emerald', disabled: false },
    { label: 'Bán kèm', Icon: Package, onClick: onSell, tone: 'zinc', disabled: false },
    { label: 'Bán lẻ', Icon: ShoppingCart, onClick: onRetail, tone: 'amber', disabled: retailDisabled },
  ] as const

  const toneClasses: Record<typeof actions[number]['tone'], string> = {
    emerald:
      'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300',
    zinc:
      'border-zinc-200 bg-white text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200',
    amber:
      'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300',
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      {actions.map(({ label, Icon, onClick, tone, disabled }) => (
        <button
          key={label}
          type="button"
          disabled={!shiftReady || disabled}
          onClick={onClick}
          className={`flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl border text-sm font-medium shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${toneClasses[tone]}`}
        >
          <Icon size={20} />
          <span>{label}</span>
        </button>
      ))}
    </div>
  )
}
