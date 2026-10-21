import { expect, test, type Page } from '@playwright/test'
import {
  createPricingRule,
  ensureOwnShift,
  fetchJson,
  label,
  login,
  modal,
} from './helpers'

interface CheckoutResult {
  invoiceNo: string
  grandTotal: number
  checkedOutPlayers: number
  remainingPlayers: number
  sessionClosed: boolean
}

async function checkInPlayers(
  page: Page,
  name: string,
  playerCount: number,
  startHoursAgo: number,
): Promise<{ id: string; startTime: Date }> {
  await page.getByRole('button', { name: 'Check-in' }).click()
  const dialog = modal(page)
  await dialog.locator('#walk-in-name').fill(name)
  if (playerCount > 1) {
    await dialog.locator('#player-count').fill(String(playerCount))
  }

  // Chỉ lùi giờ trong khoảng ca đang mở — UI chặn giờ trước lúc mở ca.
  const shiftBody = await fetchJson<{ data: { myShift: { openedAt: string } | null } }>(
    page,
    '/api/shifts?current=true&openOperational=true',
  )
  const openedAt = shiftBody.data.myShift
    ? new Date(shiftBody.data.myShift.openedAt)
    : new Date(0)
  const now = new Date()
  const desired = new Date(now.getTime() - startHoursAgo * 60 * 60 * 1000)
  const earliest = new Date(openedAt.getTime() + 60_000)
  const chosen = new Date(Math.max(desired.getTime(), earliest.getTime()))
  const canBackdate = startHoursAgo > 0 && chosen.getTime() < now.getTime() - 60_000
  if (canBackdate) {
    await dialog
      .locator('#check-in-start-time')
      .fill(`${String(chosen.getHours()).padStart(2, '0')}:${String(chosen.getMinutes()).padStart(2, '0')}`)
  }
  const startTime = canBackdate ? chosen : now

  const posted = page.waitForResponse(
    (response) => response.url().endsWith('/api/sessions') && response.request().method() === 'POST',
  )
  await dialog.getByRole('button', { name: 'Check-in' }).click()
  const response = await posted
  expect(response.status()).toBe(201)
  const id = ((await response.json()) as { data: { id: string } }).data.id
  return { id, startTime }
}

async function pay(page: Page, sessionId: string, pricingName: string, cta: RegExp) {
  await page
    .locator(`[data-session-id="${sessionId}"]`)
    .getByRole('button', { name: 'Thu', exact: true })
    .click()
  const drawer = modal(page)
  await expect(drawer.getByText('Liên 1 · Tính tiền')).toBeVisible()

  // Nhóm chưa chốt giá vẫn phải chọn được bảng giá — kể cả lượt thu sau khi
  // nhóm khác/người khác đã thu xong (bug "khoá cứng nhóm" trong tài liệu).
  const pricing = drawer.getByLabel('Chọn bảng giá')
  await expect(pricing).toBeVisible()
  await pricing.selectOption({ label: pricingName })

  const posted = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/sessions/${sessionId}/checkout`) &&
      response.request().method() === 'POST',
  )
  await drawer.getByRole('button', { name: cta }).click()
  const response = await posted
  expect(response.status(), await response.text()).toBe(200)
  return ((await response.json()) as { data: CheckoutResult }).data
}

/**
 * Thu trước: thu 1 người, phiên vẫn ACTIVE và người còn lại chọn được bảng giá
 * ở lượt thu sau. Đây là đường tiền dễ sai nhất của checkout.
 */
test.describe('POS: thu trước từng người', () => {
  test('thu 1 trong 2 người, phiên giữ ACTIVE rồi thu nốt người còn lại', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Luồng tiền chạy một lần trên bảng desktop')

    const pricingName = label('Giá')
    const customerName = label('Khách 2 người')
    const hourlyRate = 120000
    // Lùi 2 giờ để có tiền giờ thật; helper sẽ kẹp lại trong khoảng ca đang mở.
    const hoursAgo = Math.min(2, new Date().getHours())

    await login(page)
    await createPricingRule(page, pricingName, hourlyRate)
    await ensureOwnShift(page)

    const { id: sessionId, startTime } = await checkInPlayers(page, customerName, 2, hoursAgo)
    await expect(page.getByText(customerName)).toBeVisible()

    // Server làm tròn giờ chơi 2 chữ số; lấy sàn để assertion không lệch rounding.
    const elapsedHours = Math.max(0, (Date.now() - startTime.getTime()) / 3_600_000)
    const onePlayerMinimum = (Math.floor(elapsedHours * 100) / 100) * hourlyRate

    // ── Lượt 1: bỏ chọn 1 người → chỉ thu người còn chọn ────────────────────
    await page
      .locator(`[data-session-id="${sessionId}"]`)
      .getByRole('button', { name: 'Thu', exact: true })
      .click()
    const drawer = modal(page)
    await expect(drawer.getByText('Liên 1 · Tính tiền')).toBeVisible()
    const playerRows = drawer.getByRole('button', { name: /^Người \d/ })
    await expect(playerRows).toHaveCount(2)
    await expect(playerRows.first()).toHaveAttribute('aria-pressed', 'true')

    await playerRows.nth(1).click()
    await expect(playerRows.nth(1)).toHaveAttribute('aria-pressed', 'false')

    await drawer.getByLabel('Chọn bảng giá').selectOption({ label: pricingName })
    const firstPosted = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/sessions/${sessionId}/checkout`) &&
        response.request().method() === 'POST',
    )
    await drawer.getByRole('button', { name: 'Thu trước 1 người' }).click()
    const firstResponse = await firstPosted
    expect(firstResponse.status(), await firstResponse.text()).toBe(200)

    const first = ((await firstResponse.json()) as { data: CheckoutResult }).data
    expect(first.checkedOutPlayers).toBe(1)
    expect(first.remainingPlayers).toBe(1)
    expect(first.sessionClosed).toBe(false)
    // Chỉ tính tiền người được chọn: nếu thu nhầm cả 2 người thì số tiền sẽ gấp đôi.
    expect(first.grandTotal).toBeGreaterThanOrEqual(onePlayerMinimum)
    expect(first.grandTotal).toBeLessThan(2 * onePlayerMinimum || Number.MAX_SAFE_INTEGER)

    // Phiên vẫn đang chơi cho người chưa thu
    const afterFirst = await fetchJson<{ data: { status: string } }>(page, `/api/sessions/${sessionId}`)
    expect(afterFirst.data.status).toBe('ACTIVE')

    await page.goto('/sessions')
    await expect(page.getByText(customerName)).toBeVisible()

    // ── Lượt 2: thu nốt người còn lại, bảng giá chọn lại được ───────────────
    const second = await pay(page, sessionId, pricingName, /Thu tiền/)
    expect(second.sessionClosed).toBe(true)
    expect(second.remainingPlayers).toBe(0)
    expect(second.invoiceNo).not.toBe(first.invoiceNo)
    expect(second.grandTotal).toBeGreaterThanOrEqual(onePlayerMinimum)
    expect(second.grandTotal).toBeLessThan(2 * onePlayerMinimum || Number.MAX_SAFE_INTEGER)

    const afterSecond = await fetchJson<{ data: { status: string } }>(page, `/api/sessions/${sessionId}`)
    expect(afterSecond.data.status).toBe('COMPLETED')

    // Hai lượt thu = hai hoá đơn riêng, không thu lại người đã trả
    expect(second.checkedOutPlayers).toBe(1)

    await page.goto('/sessions')
    await expect(page.getByText(customerName)).toHaveCount(0)
  })
})
