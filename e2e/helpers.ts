import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, type Page } from '@playwright/test'
import { loadCredentials } from './credentials'

const statePath = resolve(process.cwd(), '.e2e-state.json')

interface E2EState {
  /** Ca có sẵn của môi trường dev mà lượt chạy này đã tham gia — cần gỡ lại khi xong */
  joined?: { shiftId: string; staffId: string }
}

function recordJoinedShift(joined: { shiftId: string; staffId: string }) {
  const state: E2EState = existsSync(statePath)
    ? (JSON.parse(readFileSync(statePath, 'utf8')) as E2EState)
    : {}
  writeFileSync(statePath, JSON.stringify({ ...state, joined }), 'utf8')
}

/** Modal của dự án không gắn `role="dialog"` — nhận diện bằng `data-modal-panel`. */
export function modal(page: Page) {
  // Nhiều panel có thể cùng tồn tại (drawer + tờ chọn hàng); luôn lấy panel trên cùng.
  return page.locator('[data-modal-panel]').last()
}

export async function login(page: Page) {
  const credentials = loadCredentials()

  await page.goto('/login')
  await page.getByPlaceholder('Nhập tên đăng nhập').fill(credentials.username)
  await page.getByPlaceholder('Nhập mật khẩu').fill(credentials.password)

  // Lần đầu của mỗi lượt chạy, Next dev còn compile route login → chậm hơn 5s.
  const posted = page.waitForResponse(
    (response) => response.url().endsWith('/api/auth/login') && response.request().method() === 'POST',
  )
  await page.getByRole('button', { name: 'Đăng nhập' }).click()
  const response = await posted
  expect(response.status(), await response.text()).toBe(200)
  await expect(page).toHaveURL(/\/sessions/, { timeout: 20_000 })
}

/** Đọc JSON từ API cùng origin (cookie phiên đã có sẵn) — dùng cho assertion. */
export async function fetchJson<T>(page: Page, url: string): Promise<T> {
  const response = await page.request.get(url)
  expect(response.ok(), `GET ${url} trả về ${response.status()}`).toBe(true)
  return (await response.json()) as T
}

export async function createPricingRule(page: Page, name: string, ratePerHour: number) {
  await page.goto('/pricing')
  await page.getByRole('button', { name: 'Thêm quy tắc bảng giá' }).click()

  const dialog = modal(page)
  await dialog.locator('#pricing-name').fill(name)
  await dialog.locator('#pricing-rate').fill(String(ratePerHour))
  await dialog.locator('#pricing-hour-from').fill('0')
  await dialog.locator('#pricing-hour-to').fill('24')
  await page.getByRole('button', { name: 'Cả tuần' }).click()

  const posted = page.waitForResponse(
    (response) => response.url().endsWith('/api/pricing') && response.request().method() === 'POST',
  )
  await dialog.getByRole('button', { name: 'Lưu bảng giá' }).click()
  expect((await posted).status()).toBe(201)
  await expect(page.locator('tr').filter({ hasText: name })).toBeVisible()
}

export async function createProduct(
  page: Page,
  input: { name: string; price: number; stock: number; minStock?: number },
) {
  await page.goto('/inventory')
  await page.getByRole('button', { name: 'Thêm hàng hoặc dịch vụ' }).click()

  const dialog = modal(page)
  await dialog.locator('#product-name').fill(input.name)
  await dialog.locator('#product-price').fill(String(input.price))
  await dialog.locator('#product-stock').fill(String(input.stock))
  await dialog.locator('#product-min-stock').fill(String(input.minStock ?? 0))

  const posted = page.waitForResponse(
    (response) => response.url().endsWith('/api/products') && response.request().method() === 'POST',
  )
  await dialog.getByRole('button', { name: 'Lưu vào kho' }).click()
  expect((await posted).status()).toBe(201)
  await expect(page.locator('tr').filter({ hasText: input.name })).toBeVisible()
}

/** Tồn kho hiện tại theo tên — đọc từ API để assertion không phụ thuộc giao diện. */
export async function stockOf(page: Page, name: string): Promise<number> {
  const body = await fetchJson<{ data: Array<{ name: string; stockQuantity: number }> }>(
    page,
    `/api/products?search=${encodeURIComponent(name)}&isActive=true`,
  )
  const product = body.data.find((item) => item.name === name)
  expect(product, `Không thấy hàng "${name}" trong kho`).toBeTruthy()
  return product!.stockQuantity
}

/**
 * Đảm bảo tài khoản đang đăng nhập có ca của chính mình.
 * Ba trạng thái có thể gặp: cổng "Mở ca", cổng "Tham gia ca", hoặc đã có ca.
 */
export async function ensureOwnShift(page: Page) {
  await page.goto('/sessions')

  const checkIn = page.getByRole('button', { name: 'Check-in' })
  const gate = page.locator('section[aria-labelledby="shift-gate-title"]')
  const joinOnStrip = page.getByRole('button', { name: 'Tham gia ca' })

  await expect
    .poll(
      async () =>
        (await checkIn.isVisible()) ||
        (await gate.isVisible()) ||
        (await joinOnStrip.isVisible()),
      // Next dev compile route + Supabase lần đầu có thể quá 15s mặc định.
      { message: 'Chờ màn Ca hôm nay tải xong', timeout: 30_000 },
    )
    .toBe(true)
  if (await checkIn.isVisible()) return

  // Dải ca ở chế độ giám sát ("Chỉ xem"): nút "Tham gia ca" gọi thẳng use-case,
  // không mở dialog — khác với cổng ca ở chế độ chưa có ca nào.
  if (await joinOnStrip.isVisible()) {
    const posted = page.waitForResponse(
      (response) => response.url().includes('/api/shifts') && response.request().method() === 'POST',
    )
    await joinOnStrip.click()
    const response = await posted
    expect(response.status(), await response.text()).toBeLessThan(400)

    const shiftId = ((await response.json()) as { data: { id: string } }).data.id
    const me = await fetchJson<{ data: { userId: string } }>(page, '/api/auth/me')
    recordJoinedShift({ shiftId, staffId: me.data.userId })

    await expect(checkIn).toBeVisible()
    return
  }

  const joinExisting = await gate
    .getByRole('heading', { name: /Có ca quầy đang mở/ })
    .isVisible()
  await gate.getByRole('button').click()

  const dialog = modal(page)
  await expect(dialog).toBeVisible()
  if (!joinExisting) {
    await dialog.locator('#opening-cash').fill('0')
    await dialog.locator('#opening-notes').fill(`[E2E] ca kiểm thử ${Date.now()}`)
  }

  const posted = page.waitForResponse(
    (response) => response.url().includes('/api/shifts') && response.request().method() === 'POST',
  )
  await dialog
    .getByRole('button', { name: joinExisting ? 'Tham gia ca' : 'Mở ca' })
    .click()
  const response = await posted
  expect(response.status()).toBeLessThan(400)

  const shiftId = ((await response.json()) as { data: { id: string } }).data.id
  if (joinExisting) {
    const me = await fetchJson<{ data: { userId: string } }>(page, '/api/auth/me')
    recordJoinedShift({ shiftId, staffId: me.data.userId })
  }

  await expect(checkIn).toBeVisible()
}

export function label(prefix: string) {
  return `[E2E] ${prefix} ${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
}
