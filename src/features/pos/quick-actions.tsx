import { LogIn, Package, ShoppingCart } from 'lucide-react'
import { ActionTile } from '@/components/ui/action-tile'

/**
 * Ba hành động chính của ca — hàng ô lớn, mỗi ô cao đúng 56px.
 *
 * Ô là primitive `ActionTile` (`@/components/ui/action-tile`) — mẫu chung của
 * mọi hàng hành động lớn trong hệ thống, lấy chính từ hàng này. Giữ ở đây vì
 * thứ tự và nhãn là quyết định riêng của màn Ca hôm nay.
 *
 * `layout="column"`: chỉ từ `lg` trở lên mới xếp icon trên nhãn và phóng to
 * (icon 28px + chữ 16px) — ô cao bằng dải ca (112px), không bị trống. Điện
 * thoại giữ nguyên hàng ngang 56px như trước.
 *
 * `whitespace-nowrap`: nhãn không được wrap giữa từ ("Bán/kèm", "Check-/in").
 *
 * Desktop: hàng này nằm CHUNG HÀNG với dải ca, đẩy sang phải (xem
 * `today-shift-screen.tsx`). Track cố định 26.5rem = 3 ô ~8.8rem + 2 khe 8px:
 * giữ đúng kích thước ô như điện thoại, đủ chỗ cho dải ca giữ ~56% bề rộng
 * mà các nút của dải (Đếm dụng cụ · Giao dịch · Đóng ca ≈ 460px) vẫn nằm
 * được trên một hàng. Tablet (md) chưa đủ chỗ cho hai khối nên vẫn canh giữa.
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
    { label: 'Bán kèm', icon: Package, tone: 'secondary' as const, onClick: onSell, disabled: sellDisabled },
    { label: 'Check-in', icon: LogIn, tone: 'primary' as const, onClick: onCheckIn, disabled: false },
    { label: 'Bán lẻ', icon: ShoppingCart, tone: 'secondary' as const, onClick: onRetail, disabled: retailDisabled },
  ]

  return (
    <div className="grid grid-cols-3 gap-2 md:grid-cols-[repeat(3,minmax(0,9rem))] md:justify-center lg:w-[26.5rem] lg:shrink-0">
      {actions.map(({ label, icon, tone, onClick, disabled }) => (
        <ActionTile
          key={label}
          label={label}
          icon={icon}
          tone={tone}
          layout="column"
          disabled={!shiftReady || disabled}
          onClick={onClick}
        />
      ))}
    </div>
  )
}