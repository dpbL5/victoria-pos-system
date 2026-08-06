import { LogIn, Package } from 'lucide-react'

export function QuickActions({
  shiftReady,
  onCheckIn,
  onSell,
}: {
  shiftReady: boolean
  onCheckIn: () => void
  onSell: () => void
}) {
  const actions = [
    { label: 'Check-in', Icon: LogIn, onClick: onCheckIn, tone: 'emerald' },
    { label: 'Bán kèm', Icon: Package, onClick: onSell, tone: 'zinc' },
  ] as const

  return (
    <div className="grid grid-cols-2 gap-2">
      {actions.map(({ label, Icon, onClick, tone }) => (
        <button
          key={label}
          type="button"
          disabled={!shiftReady}
          onClick={onClick}
          className={`flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl border text-sm font-medium shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
            tone === 'emerald'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300'
              : 'border-zinc-200 bg-white text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200'
          }`}
        >
          <Icon size={20} />
          <span>{label}</span>
        </button>
      ))}
    </div>
  )
}
