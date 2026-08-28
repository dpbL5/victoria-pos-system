'use client'

import { Loader2, type LucideIcon } from 'lucide-react'
import { type ButtonHTMLAttributes, forwardRef } from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'inverse' | 'outline-danger'
type ButtonSize = 'xs' | 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: LucideIcon
  loading?: boolean
  fullWidth?: boolean
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-brand text-white hover:bg-brand-dark shadow-sm dark:bg-blue-600 dark:hover:bg-blue-700',
  secondary:
    'border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700',
  danger:
    'bg-red-600 text-white hover:bg-red-700',
  ghost:
    'text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300',
  inverse:
    'bg-zinc-950 text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200',
  'outline-danger':
    'border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300 dark:hover:bg-red-500/15',
}

const sizeClasses: Record<ButtonSize, string> = {
  xs: 'px-2 py-1 text-xs gap-1',
  sm: 'px-3 py-1.5 text-xs gap-1.5',
  md: 'px-4 py-2 text-sm gap-2',
  lg: 'px-4 py-3 text-sm gap-2',
}

const iconOnlyClasses: Record<ButtonSize, string> = {
  xs: 'p-1',
  sm: 'p-1.5',
  md: 'p-1.5',
  lg: 'p-2',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', icon: Icon, loading, fullWidth, className = '', children, disabled, ...props }, ref) => {
    const isIconOnly = Icon && !children
    const isDisabled = disabled || loading

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        className={`inline-flex items-center justify-center rounded-lg font-medium transition-colors active:scale-[0.97] motion-safe:transition-transform disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 ${
          variantClasses[variant]
        } ${
          isIconOnly ? iconOnlyClasses[size] : sizeClasses[size]
        } ${fullWidth ? 'w-full' : ''} ${className}`}
        {...props}
      >
        {loading ? (
          <Loader2 size={16} className="animate-spin" />
        ) : Icon ? (
          <Icon size={16} />
        ) : null}
        {children}
      </button>
    )
  }
)

Button.displayName = 'Button'
