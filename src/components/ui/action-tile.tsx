'use client'

import Link from 'next/link'
import { Loader2, type LucideIcon } from 'lucide-react'
import { buttonClass, type ButtonVariant } from '@/components/ui/button'

/**
 * Ô hành động lớn — mẫu chung lấy từ hàng `Bán kèm · Check-in · Bán lẻ` của
 * màn Ca hôm nay (`src/features/pos/quick-actions.tsx`).
 *
 * Vì sao tách riêng thay vì dùng `Button`: ô này là **đích bấm lớn** cho màn
 * vận hành (cao 56px, icon 20px + nhãn một dòng), khác hẳn nút trong form/dialog.
 * Trước đây chỉ màn POS có, nên mỗi chỗ cần "nút to kiểu đó" lại tự chế class —
 * và tự chế thì quên focus ring (xem `focus-visible:ring-brand` từng ở
 * attendance-dialog). Nay mọi ô hành động lớn đi qua đây nên kích thước, focus,
 * trạng thái disabled và nhịp nhấn giống nhau trên toàn hệ thống.
 *
 * - `size="md"` (mặc định): 56px — hàng hành động chính của một màn.
 * - `size="sm"`: 44px — dành cho hàng dày (điểm danh trong danh sách học viên).
 *   Hai size chỉ khác chiều cao và cỡ icon; nhãn dùng chung bậc `label` 12px.
 *   KHÔNG thêm `text-sm`/`text-base` vào đây: nó xung đột với `text-xs` do
 *   `buttonClass` phát ra, và Tailwind quyết định theo thứ tự trong bảng CSS
 *   chứ không theo thứ tự class — thêm vào là âm thầm đổi cỡ chữ.
 * - Truyền `active` (kể cả `false`) = ô trạng thái: luôn phát `aria-pressed`,
 *   chưa chọn thì rơi về nền xám trung tính.
 * - `layout="column"`: **chỉ từ `lg` trở lên** mới xếp icon trên nhãn và
 *   phóng to cả hai (ô cao bằng dải ca). Dưới `lg` giữ y hệt hàng ngang 56px
 *   của điện thoại — mọi class ở đây đều tiền tố `lg:`.
 *   Cỡ chữ phải dùng `!` vì `buttonClass` đã phát `text-xs`; Tailwind quyết
 *   định thắng thua theo thứ tự trong bảng CSS chứ không theo thứ tự class
 *   viết ra (xem ghi chú đầu file).
 * - `href` = render `<Link>` (điều hướng, không phải hành động). `<Link>`
 *   không có trạng thái disabled của trình duyệt — điều hướng khoá được thì
 *   dùng `onClick` + `disabled`, đừng truyền cả hai.
 */

type ActionTileSize = 'sm' | 'md'
type ActionTileTone = 'primary' | 'secondary' | 'success' | 'danger'
type ActionTileLayout = 'row' | 'column'

const TONE_VARIANT: Record<ActionTileTone, ButtonVariant> = {
  primary: 'contrast',
  secondary: 'grey',
  success: 'success',
  danger: 'red-soft',
}

export interface ActionTileProps {
  label: string
  icon: LucideIcon
  /** Màu theo vai trò — `primary` là hành động chính của màn */
  tone?: ActionTileTone
  size?: ActionTileSize
  /** `column` = từ `lg` trở lên: icon trên nhãn, icon + chữ to hơn */
  layout?: ActionTileLayout
  /** Ô trạng thái (điểm danh, chọn lọc). Bỏ trống = hành động thường. */
  active?: boolean
  href?: string
  disabled?: boolean
  loading?: boolean
  className?: string
  title?: string
  onClick?: () => void
  'aria-label'?: string
}

export function ActionTile({
  label,
  icon: Icon,
  tone = 'secondary',
  size = 'md',
  layout = 'row',
  active,
  href,
  disabled = false,
  loading = false,
  className = '',
  title,
  onClick,
  'aria-label': ariaLabel,
}: ActionTileProps) {
  const isToggle = active !== undefined
  const variant = isToggle && !active ? 'grey' : TONE_VARIANT[tone]
  const stacked = layout === 'column'
  const iconSize = size === 'sm' ? 16 : 20
  // Dưới `lg` không thêm class nào: ô giữ nguyên hàng ngang, icon 20px, chữ 12px
  // của điện thoại. Từ `lg` trở lên class Tailwind đè được attribute
  // width/height của lucide, còn cỡ chữ phải dùng `!` để thắng `text-xs` của
  // buttonClass(size: 'sm') — xem lý do ở chú thích đầu file.
  const iconClass = stacked ? (size === 'sm' ? 'lg:h-6 lg:w-6' : 'lg:h-7 lg:w-7') : ''
  const labelClass = stacked ? (size === 'sm' ? 'lg:!text-sm' : 'lg:!text-base') : ''
  const stackClass = stacked ? 'lg:flex-col lg:!gap-2.5' : ''
  // Chỉ chiều cao tối thiểu — `buttonClass(size: 'sm')` đã lo phần đệm, khe và
  // cỡ chữ. Thêm class cùng nhóm ở đây sẽ xung đột (xem chú thích đầu file).
  const sizeClass = size === 'sm' ? 'min-h-11' : 'min-h-14'

  const classes = `${buttonClass({
    variant,
    size: 'sm',
    className: `whitespace-nowrap motion-press ${sizeClass} ${stackClass}`,
  })} ${className}`

  const content = (
    <>
      {loading ? (
        <Loader2 size={iconSize} className={`animate-spin ${iconClass}`} aria-hidden />
      ) : (
        <Icon size={iconSize} className={iconClass} aria-hidden />
      )}
      <span className={`truncate ${labelClass}`}>{label}</span>
    </>
  )

  if (href) {
    return (
      <Link
        href={href}
        title={title}
        aria-label={ariaLabel}
        aria-current={active ? 'true' : undefined}
        data-action-tile={size}
        className={classes}
      >
        {content}
      </Link>
    )
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      title={title}
      aria-label={ariaLabel}
      aria-pressed={isToggle ? active : undefined}
      data-action-tile={size}
      className={classes}
    >
      {content}
    </button>
  )
}