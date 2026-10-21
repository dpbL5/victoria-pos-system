import { expect, test } from '@playwright/test'
import { loadCredentials } from './credentials'

test.describe('Quản trị danh mục', () => {
  test('tạo bảng giá, hàng hóa và điều chỉnh tồn kho', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Thao tác bảng desktop')

    const credentials = loadCredentials()
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
    const pricingName = `[E2E] Giá ${suffix}`
    const productName = `[E2E] Nước ${suffix}`

    await page.goto('/login')
    await page.getByPlaceholder('Nhập tên đăng nhập').fill(credentials.username)
    await page.getByPlaceholder('Nhập mật khẩu').fill(credentials.password)
    await page.getByRole('button', { name: 'Đăng nhập' }).click()
    await expect(page).toHaveURL(/\/sessions/)

    await page.goto('/pricing')
    await expect(page.getByRole('heading', { name: 'Bảng giá' })).toBeVisible()
    await page.getByRole('button', { name: 'Thêm quy tắc bảng giá' }).click()
    await page.locator('#pricing-name').fill(pricingName)
    await page.locator('#pricing-rate').fill('120000')
    await page.locator('#pricing-hour-from').fill('0')
    await page.locator('#pricing-hour-to').fill('24')
    await page.getByRole('button', { name: 'Cả tuần' }).click()

    const createPricing = page.waitForResponse(
      (response) => response.url().endsWith('/api/pricing') && response.request().method() === 'POST',
    )
    await page.getByRole('button', { name: 'Lưu bảng giá' }).click()
    await expect((await createPricing).status()).toBe(201)
    await expect(page.locator('tr').filter({ hasText: pricingName })).toBeVisible()

    await page.goto('/inventory')
    await expect(page.getByRole('heading', { name: 'Hàng hóa & dịch vụ' })).toBeVisible()
    await page.getByRole('button', { name: 'Thêm hàng hoặc dịch vụ' }).click()
    await page.locator('#product-name').fill(productName)
    await page.locator('#product-price').fill('30000')
    await page.locator('#product-stock').fill('2')
    await page.locator('#product-min-stock').fill('1')

    const createProduct = page.waitForResponse(
      (response) => response.url().endsWith('/api/products') && response.request().method() === 'POST',
    )
    await page.getByRole('button', { name: 'Lưu vào kho' }).click()
    await expect((await createProduct).status()).toBe(201)

    const productRow = page.locator('tr').filter({ hasText: productName })
    await expect(productRow).toBeVisible()
    await productRow.getByRole('button', { name: 'Nhập / chỉnh' }).click()
    await expect(page.getByRole('heading', { name: `Nhập / chỉnh - ${productName}` })).toBeVisible()
    await page.locator('#stock-movement-quantity').fill('3')

    const adjustStock = page.waitForResponse(
      (response) => /\/api\/products\/[^/]+\/stock$/.test(response.url()) && response.request().method() === 'POST',
    )
    await page.getByRole('button', { name: 'Cập nhật tồn kho' }).click()
    await expect((await adjustStock).status()).toBe(200)
    await expect(productRow).toContainText('5')
  })
})
