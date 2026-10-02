'use client'

import { Loader2, type LucideIcon } from 'lucide-react'
import { type ButtonHTMLAttributes, forwardRef } from 'react'

export type ButtonVariant =
  | 'blue'
  | 'red'
  | 'red-soft'
  | 'success'
  | 'yellow'
  | 'white'
  | 'grey'
  | 'contrast'
  | 'ghost'
type ButtonSize = 'xs' | 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: LucideIcon
  loading?: boolean
  fullWidth?: boolean
}

// MỌI variant đều có đúng 1px viền — variant nền đặc dùng viền trong suốt.
// Không có viền thì nút thấp hơn 2px và đứng cạnh nhau trong cùng một hàng sẽ
// lệch (đo được: Hủy/red-soft 30px cạnh Xác nhận/contrast 28px). DESIGN.md ghi
// các nút có nhãn cùng một chiều cao, nên viền là phần của hình dạng, không
// phải phần của màu — đổi màu không được đổi chiều cao.
const variantClasses: Record<ButtonVariant, string> = {
  blue:
    'border border-transparent bg-info text-white shadow-sm hover:opacity-90',
  red:
    'border border-transparent bg-danger text-white shadow-sm hover:opacity-90',
  'red-soft':
    'border border-danger-border bg-danger-bg text-danger hover:bg-danger-border',
  success:
    'border border-success-border bg-success-bg text-success hover:bg-success-border',
  yellow:
    'border border-transparent bg-yellow text-zinc-900 shadow-sm hover:opacity-90',
  white:
    'border border-border-default bg-surface-elevated text-text-primary shadow-sm hover:bg-surface-tertiary',
  grey:
    'border border-transparent bg-surface-tertiary text-text-primary shadow-sm hover:opacity-90',
  contrast:
    'border border-transparent bg-text-primary text-text-inverse shadow-sm hover:opacity-90',
  ghost:
    'border border-transparent text-text-tertiary hover:bg-surface-tertiary hover:text-text-primary',
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

const baseClasses =
  'inline-flex items-center justify-center rounded-lg font-medium transition-colors active:scale-[0.97] motion-safe:transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-primary disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100'

/** Class của primitive — dùng cho `<Link>`/`<a>` cần hình dạng button mà không render được `<button>`. */
export function buttonClass({
  variant = 'blue',
  size = 'md',
  iconOnly = false,
  fullWidth = false,
  className = '',
}: {
  variant?: ButtonVariant
  size?: ButtonSize
  iconOnly?: boolean
  fullWidth?: boolean
  className?: string
} = {}) {
  return `${baseClasses} ${variantClasses[variant]} ${
    iconOnly ? iconOnlyClasses[size] : sizeClasses[size]
  } ${fullWidth ? 'w-full' : ''} ${className}`
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'blue', size = 'md', icon: Icon, loading, fullWidth, className = '', children, disabled, ...props }, ref) => {
    const isIconOnly = Icon && !children
    const isDisabled = disabled || loading

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        className={buttonClass({ variant, size, iconOnly: isIconOnly, fullWidth, className })}
        {...props}
      >
        {loading ? (
          <Loader2 size={16} className="animate-spin" />
        ) : Icon ? (
          <Icon size={16} />
        ) : null}
        {children && <span className="button-label flex items-center gap-1.5">{children}</span>}
      </button>
    )
  },
)

Button.displayName = 'Button'
