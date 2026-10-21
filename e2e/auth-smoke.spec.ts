import { expect, test } from '@playwright/test'
import { loadCredentials } from './credentials'

test.describe('Xác thực và điều hướng smoke', () => {
  test('chặn dashboard khi chưa đăng nhập', async ({ page }) => {
    await page.goto('/sessions')

    await expect(page).toHaveURL(/\/login\?callbackUrl=%2Fsessions/)
    await expect(page.getByRole('heading', { name: 'VICTORIA' })).toBeVisible()
  })

  test('đăng nhập, mở màn Ca hôm nay và đăng xuất', async ({ page }) => {
    const credentials = loadCredentials()

    await page.goto('/login')
    await page.getByPlaceholder('Nhập tên đăng nhập').fill(credentials.username)
    await page.getByPlaceholder('Nhập mật khẩu').fill(credentials.password)
    const loginResponse = page.waitForResponse(
      (response) => response.url().endsWith('/api/auth/login') && response.request().method() === 'POST',
    )
    await page.getByRole('button', { name: 'Đăng nhập' }).click()
    const response = await loginResponse

    expect(await response.text()).toContain('"success":true')
    await expect(page).toHaveURL(/\/sessions/)
    await expect(page.getByRole('heading', { name: 'Ca hôm nay' })).toBeVisible()

    await page.getByRole('link', { name: /^(Thêm|Cài đặt)$/ }).click()
    await expect(page).toHaveURL(/\/settings/)
    await expect(page.getByRole('button', { name: 'Đăng xuất' })).toBeVisible()

    await page.getByRole('button', { name: 'Đăng xuất' }).click()
    await expect(page).toHaveURL(/\/login/)
    await expect(page.getByText('Đăng nhập hệ thống POS')).toBeVisible()

    await page.goto('/sessions')
    await expect(page).toHaveURL(/\/login\?callbackUrl=%2Fsessions/)
  })
})
