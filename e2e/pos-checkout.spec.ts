import { expect, test } from '@playwright/test'
import {
  createPricingRule,
  createProduct,
  ensureOwnShift,
  fetchJson,
  label,
  login,
  modal,
  stockOf,
} from './helpers'

/**
 * Luồng sâu: mở ca → check-in vãng lai → thu tiền kèm hàng hoá → huỷ hoá đơn.
 * Kiểm chứng chéo ba tầng: con số trên phiếu thu, hoá đơn đã ghi, và tồn kho.
 */
test.describe('POS: check-in → thu tiền → huỷ hoá đơn', () => {
  test('vãng lai thu tiền kèm hàng hoá, hoàn kho khi huỷ hoá đơn', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Luồng tiền chạy một lần trên bảng desktop')

    const pricingName = label('Giá')
    const productName = label('Nước')
    const customerName = label('Khách')
    const productPrice = 30000

    await login(page)
    await createPricingRule(page, pricingName, 120000)
    await createProduct(page, { name: productName, price: productPrice, stock: 5 })
    await ensureOwnShift(page)

    // ── 1. Check-in khách vãng lai ─────────────────────────────────────────
    await page.getByRole('button', { name: 'Check-in' }).click()
    const checkInDialog = modal(page)
    await expect(checkInDialog).toBeVisible()
    await checkInDialog.locator('#walk-in-name').fill(customerName)

    const checkInPosted = page.waitForResponse(
      (response) => response.url().endsWith('/api/sessions') && response.request().method() === 'POST',
    )
    await checkInDialog.getByRole('button', { name: 'Check-in' }).click()
    const checkInResponse = await checkInPosted
    expect(checkInResponse.status()).toBe(201)
    const sessionId = ((await checkInResponse.json()) as { data: { id: string } }).data.id

    await expect(page.getByText(customerName)).toBeVisible()

    // ── 2. Mở phiếu thu, chọn bảng giá của lượt chạy này ───────────────────
    // DB dev có thể còn phiên ACTIVE khác → scope đúng card của phiên vừa tạo.
    await page
      .locator(`[data-session-id="${sessionId}"]`)
      .getByRole('button', { name: 'Thu', exact: true })
      .click()
    const drawer = modal(page)
    await expect(drawer.getByText('Liên 1 · Tính tiền')).toBeVisible()

    const pricingSelect = drawer.getByLabel('Chọn bảng giá')
    if (await pricingSelect.isVisible()) {
      await pricingSelect.selectOption({ label: pricingName })
    }

    // ── 3. Thêm hàng hoá vào phiếu: CHƯA trừ kho (chỉ ghi khi bấm thu) ────
    const stockBefore = await stockOf(page, productName)
    expect(stockBefore).toBe(5)

    await drawer.getByRole('button', { name: 'Thêm hàng hoá / dịch vụ' }).click()
    await page.getByRole('button', { name: productName }).click()
    // Tờ chọn hàng vẫn mở để thêm tiếp; đóng nó để đọc lại phiếu thu bên dưới.
    await page.keyboard.press('Escape')
    await expect(page.getByRole('button', { name: `Bớt ${productName}` })).toBeVisible()

    expect(await stockOf(page, productName)).toBe(5)

    // ── 4. Số phải thu trên phiếu khớp với hoá đơn ghi ra ─────────────────
    const payableText = await drawer
      .getByText('Cần thu', { exact: true })
      .locator('xpath=following-sibling::span')
      .first()
      .innerText()
    const payableOnScreen = Number(payableText.replace(/[^\d]/g, ''))
    expect(payableOnScreen).toBeGreaterThanOrEqual(productPrice)

    const checkoutPosted = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/sessions/${sessionId}/checkout`) &&
        response.request().method() === 'POST',
    )
    await drawer.getByRole('button', { name: /Thu tiền/ }).click()
    const checkoutResponse = await checkoutPosted
    expect(checkoutResponse.status(), await checkoutResponse.text()).toBe(200)

    const checkout = (await checkoutResponse.json()) as {
      data: { invoiceId: string; invoiceNo: string; grandTotal: number; sessionClosed: boolean }
    }
    expect(checkout.data.sessionClosed).toBe(true)
    expect(checkout.data.grandTotal).toBe(payableOnScreen)

    // ── 5. Hậu kiểm: phiên kết thúc, kho đã trừ đúng 1 ─────────────────────
    const session = await fetchJson<{ data: { status: string } }>(page, `/api/sessions/${sessionId}`)
    expect(session.data.status).toBe('COMPLETED')
    expect(await stockOf(page, productName)).toBe(4)

    await page.goto('/sessions')
    await expect(page.getByText(customerName)).toHaveCount(0)

    // ── 6. Huỷ hoá đơn → hoàn kho, không xoá payment gốc ───────────────────
    await page.goto(`/invoices/${checkout.data.invoiceId}`)
    await expect(page.getByText(checkout.data.invoiceNo)).toBeVisible()
    await page.getByRole('button', { name: 'Huỷ hoá đơn' }).first().click()

    const voidDialog = modal(page)
    await expect(voidDialog.getByText(/Xác nhận huỷ hoá đơn/)).toBeVisible()
    const voidPosted = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/invoices/${checkout.data.invoiceId}/void`) &&
        response.request().method() === 'POST',
    )
    await voidDialog.getByRole('button', { name: 'Huỷ hoá đơn' }).click()
    expect((await voidPosted).status()).toBe(200)

    expect(await stockOf(page, productName)).toBe(5)
  })
})
