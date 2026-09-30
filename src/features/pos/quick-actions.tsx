import { LogIn, Package, ShoppingCart } from 'lucide-react'
import { buttonClass } from '@/components/ui/button'

/**
 * Ba hành động chính của ca — một hàng ngang, mỗi tile cao đúng 48px.
 *
 * `size="sm"` + `whitespace-nowrap`: ở 390px, nhãn 14px bị wrap giữa từ
 * ("Bán/kèm", "Check-/in") và đẩy tile lên 56px. Nhãn 12px trên một dòng vừa
 * trong 1/3 bề ngang điện thoại.
 *
 * Desktop: track cố định 9rem và canh phải — nếu để grid 3 cột chia đều
 * `max-w-content`, mỗi tile phình ~286px, thành hàng điện thoại kéo giãn.
 *
 * `sellDisabled`: chưa có phiên nào thì "Bán kèm" không có gì để bán — nút chỉ
 * tồn tại để báo lỗi là một control hỏng.
 */
export function QuickActions({
  shiftReady,
  sellDisabled = false,
  retailDisabled = false,
  onCheckIn,
  onSell,
  onRetail,
}: {
  shiftReady: boolean
  sellDisabled?: boolean
  retailDisabled?: boolean
  onCheckIn: () => void
  onSell: () => void
  onRetail: () => void
}) {
  const actions = [
    { label: 'Bán kèm', Icon: Package, onClick: onSell, variant: 'grey', disabled: sellDisabled },
    { label: 'Check-in', Icon: LogIn, onClick: onCheckIn, variant: 'contrast', disabled: false },
    { label: 'Bán lẻ', Icon: ShoppingCart, onClick: onRetail, variant: 'grey', disabled: retailDisabled },
  ] as const

  return (
    <div className="grid grid-cols-3 gap-2 md:grid-cols-[repeat(3,minmax(0,9rem))] md:justify-end">
      {actions.map(({ label, Icon, onClick, variant, disabled }) => (
        <button
          key={label}
          type="button"
          disabled={!shiftReady || disabled}
          onClick={onClick}
          className={buttonClass({ variant, size: 'sm', className: 'min-h-12 whitespace-nowrap px-3' })}
        >
          <Icon size={20} aria-hidden />
          <span>{label}</span>
        </button>
      ))}
    </div>
  )
}
