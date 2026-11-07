import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { RetailDialog } from './retail-dialog'
import type { Product } from './types'

// ── Hiển thị tab theo quyền: bán lẻ và nhận hàng nội bộ tách riêng ──

const products: Product[] = [
  {
    id: 'p1',
    name: 'Nước suối',
    type: 'PRODUCT',
    price: 10000,
    stockQuantity: 5,
    minStockLevel: 0,
    isActive: true,
  },
]

function render(canRetail: boolean, canStaffDrink: boolean) {
  return renderToStaticMarkup(
    <RetailDialog
      open
      products={products}
      productsLoading={false}
      productsError=""
      onRetryProducts={() => {}}
      shiftReady
      canRetail={canRetail}
      canStaffDrink={canStaffDrink}
      submitting={false}
      setSubmitting={() => {}}
      onClose={() => {}}
      onDone={async () => {}}
    />,
  )
}

describe('RetailDialog — tab theo quyền', () => {
  it('có cả hai quyền: hiện cả hai tab', () => {
    const html = render(true, true)
    expect(html).toContain('Bán lẻ')
    expect(html).toContain('Khách hàng')
    expect(html).toContain('Nhân viên')
  })

  it('chỉ quyền bán lẻ: không có tab nhân viên', () => {
    const html = render(true, false)
    expect(html).toContain('Nước / dịch vụ')
    expect(html).not.toContain('Nhân viên')
  })

  it('chỉ quyền nhận hàng nội bộ: mở thẳng tab nhân viên, không có tab khách hàng', () => {
    const html = render(false, true)
    expect(html).toContain('Nhận hàng nội bộ')
    expect(html).toContain('Đang kiểm tra...')
    expect(html).not.toContain('Khách hàng')
  })
})
