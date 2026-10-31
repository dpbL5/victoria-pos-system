import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import {
  expect,
  request as pwRequest,
  test,
  type APIRequestContext,
  type Page,
} from '@playwright/test'
import { ALL_PERMISSIONS } from '../src/lib/shared/permissions'
import { loadCredentials } from './credentials'

/**
 * E2E ma trận quyền — khoá toàn bộ hệ custom role:
 *
 * 1. User role 0 quyền → MỌI endpoint có gate đều phải trả 403.
 *    Đây là lớp test bắt đúng lỗi "endpoint quên gate quyền" — endpoint nào
 *    gate sai/thiếu sẽ trả 200/400 thay vì 403 và test fail ngay.
 * 2. User role toàn quyền → mọi endpoint đọc trả 200, các thao tác ghi đi qua
 *    gate (dừng ở validation/not-found, KHÔNG tạo dữ liệu trên DB dev).
 * 3. UI theo role: nav ẩn nhóm không có quyền, page guard redirect, "Chưa phân
 *    vai" hiển thị màn chờ, ADMIN role bị khoá không sửa/xoá được.
 * 4. Xoá role → user bị gỡ gán về "Chưa phân vai" (auth vẫn đọc DB mỗi request).
 *
 * Lưu ý rate limit: requireMutationAuth giới hạn 30 mutation/phút/IP theo
 * window 60s → các lô mutation được tách và chờ window mới (hằng số bên dưới).
 */

const execFileAsync = promisify(execFile)

const BASE = 'http://127.0.0.1:3100'
const MUTATION_WINDOW_MS = 61_000
const CSRF_COOKIE = 'qltrungcung_csrf'
const CSRF_HEADER = 'X-CSRF-Token'

const ID = {
  session: '11111111-1111-4111-8111-111111111111',
  booking: '22222222-2222-4222-8222-222222222222',
  customer: '33333333-3333-4333-8333-333333333333',
  invoice: '44444444-4444-4444-8444-444444444444',
  pricing: '55555555-5555-4555-8555-555555555555',
  promotion: '66666666-6666-4666-8666-666666666666',
  tool: '77777777-7777-4777-8777-777777777777',
  shift: '88888888-8888-4888-8888-888888888888',
  user: '99999999-9999-4999-8999-999999999999',
  role: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  cashflow: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  student: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  class: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  lesson: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  player: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
  product: '10101010-1010-4010-8010-101010101010',
  plan: '12121212-1212-4212-8212-121212121212',
}

// ── Probe đọc: role 0 quyền → 403, role toàn quyền → 200 ──
const READS: Array<{ name: string; path: string }> = [
  { name: 'sessions.view', path: '/api/sessions' },
  { name: 'bookings.view', path: '/api/bookings' },
  { name: 'customers.view', path: '/api/customers' },
  { name: 'memberships (xem)', path: '/api/memberships' },
  { name: 'reports.view', path: '/api/reports/dashboard' },
  { name: 'reports.view', path: '/api/reports/revenue' },
  { name: 'reports.view', path: '/api/reports/trends' },
  { name: 'reports.view', path: '/api/reports/top-products' },
  { name: 'reports.viewAll', path: '/api/reports/shifts' },
  { name: 'reports.export', path: '/api/reports/export' },
  { name: 'cashflows.view', path: '/api/cashflows' },
  { name: 'pricing.view', path: '/api/pricing' },
  { name: 'promotions.view', path: '/api/promotions' },
  { name: 'users.view', path: '/api/users' },
  { name: 'roles.view', path: '/api/roles' },
  { name: 'audit.view', path: '/api/activity-logs' },
  { name: 'stock.view', path: '/api/stock-movements' },
  { name: 'students.view', path: '/api/students' },
  { name: 'classes.view', path: '/api/classes' },
  { name: 'lessons.view', path: '/api/lessons?from=2026-01-01&to=2026-01-31' },
  { name: 'shifts.view', path: '/api/shifts?groupBy=day&from=2026-01-01&to=2026-01-02' },
]

// ── Probe ghi: role 0 quyền → 403; role toàn quyền → không 403, không 5xx ──
// Body được chọn để nếu gate cho qua thì handler dừng ở validation/not-found:
// TUYỆT ĐỐI không dùng body hợp lệ (tránh tạo dữ liệu thật trên DB dev) —
// vd POST /api/sessions {} hợp lệ nên dùng customerPhone sai định dạng.
const MUTATIONS: Array<{
  name: string
  perm: string
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  path: string
  body?: unknown
}> = [
  { name: 'sessions.checkin', perm: 'sessions.checkin', method: 'POST', path: '/api/sessions', body: { customerPhone: 'abc' } },
  { name: 'sessions.edit', perm: 'sessions.edit', method: 'PUT', path: `/api/sessions/${ID.session}`, body: {} },
  { name: 'sessions.checkout', perm: 'sessions.checkout', method: 'POST', path: `/api/sessions/${ID.session}/checkout`, body: { paymentMethod: 'CASH' } },
  { name: 'sessions.sell (bán kèm)', perm: 'sessions.sell', method: 'POST', path: `/api/sessions/${ID.session}/sell`, body: {} },
  { name: 'sessions.sell (sửa hàng kèm)', perm: 'sessions.sell', method: 'PATCH', path: `/api/sessions/${ID.session}/sell-items`, body: {} },
  { name: 'sessions.checkin (bán lẻ)', perm: 'sessions.sell', method: 'POST', path: '/api/retail-sales', body: {} },
  { name: 'sessions.checkin (tạm dừng)', perm: 'sessions.checkin', method: 'POST', path: `/api/sessions/${ID.session}/pause`, body: {} },
  { name: 'sessions.checkin (tiếp tục)', perm: 'sessions.checkin', method: 'POST', path: `/api/sessions/${ID.session}/resume`, body: {} },
  { name: 'sessions.checkin (dừng người chơi)', perm: 'sessions.checkin', method: 'POST', path: `/api/sessions/${ID.session}/players/${ID.player}/pause`, body: {} },
  { name: 'sessions.checkin (đổi tên người chơi)', perm: 'sessions.checkin', method: 'PATCH', path: `/api/sessions/${ID.session}/players/${ID.player}`, body: { name: 'E2E' } },
  { name: 'bookings.create', perm: 'bookings.create', method: 'POST', path: '/api/bookings', body: {} },
  { name: 'bookings.confirm', perm: 'bookings.confirm', method: 'PATCH', path: `/api/bookings/${ID.booking}`, body: { action: 'check-in' } },
  { name: 'bookings.cancel', perm: 'bookings.cancel', method: 'PATCH', path: `/api/bookings/${ID.booking}`, body: { status: 'CANCELLED' } },
  { name: 'customers.create', perm: 'customers.create', method: 'POST', path: '/api/customers', body: {} },
  { name: 'customers.edit', perm: 'customers.edit', method: 'PUT', path: `/api/customers/${ID.customer}`, body: {} },
  { name: 'customers.delete', perm: 'customers.delete', method: 'DELETE', path: `/api/customers/${ID.customer}`, body: {} },
  { name: 'memberships.register', perm: 'memberships.register', method: 'POST', path: '/api/memberships/register', body: {} },
  { name: 'memberships.renew', perm: 'memberships.renew', method: 'POST', path: '/api/memberships/renew', body: {} },
  { name: 'memberships.plans.manage', perm: 'memberships.plans.manage', method: 'POST', path: '/api/membership-plans', body: {} },
  { name: 'memberships.plans.manage (xóa)', perm: 'memberships.plans.manage', method: 'DELETE', path: `/api/membership-plans/${ID.plan}`, body: {} },
  { name: 'products.create', perm: 'products.create', method: 'POST', path: '/api/products', body: {} },
  { name: 'products.delete', perm: 'products.delete', method: 'DELETE', path: `/api/products/${ID.product}`, body: {} },
  { name: 'stock.post (điều chỉnh)', perm: 'stock.post', method: 'POST', path: `/api/products/${ID.product}/stock`, body: {} },
  { name: 'invoices.void', perm: 'invoices.void', method: 'POST', path: `/api/invoices/${ID.invoice}/void`, body: {} },
  { name: 'invoices.void (xóa)', perm: 'invoices.void', method: 'DELETE', path: `/api/invoices/${ID.invoice}`, body: {} },
  { name: 'invoices.edit', perm: 'invoices.edit', method: 'POST', path: `/api/invoices/${ID.invoice}/edit`, body: {} },
  { name: 'pricing.create', perm: 'pricing.create', method: 'POST', path: '/api/pricing', body: {} },
  { name: 'pricing.edit', perm: 'pricing.edit', method: 'PUT', path: `/api/pricing/${ID.pricing}`, body: {} },
  { name: 'pricing.delete', perm: 'pricing.delete', method: 'DELETE', path: `/api/pricing/${ID.pricing}`, body: {} },
  { name: 'promotions.create', perm: 'promotions.create', method: 'POST', path: '/api/promotions', body: {} },
  { name: 'promotions.edit', perm: 'promotions.edit', method: 'PUT', path: `/api/promotions/${ID.promotion}`, body: {} },
  { name: 'promotions.delete', perm: 'promotions.delete', method: 'DELETE', path: `/api/promotions/${ID.promotion}`, body: {} },
  { name: 'tools.create', perm: 'tools.create', method: 'POST', path: '/api/tools', body: {} },
  { name: 'tools.edit', perm: 'tools.edit', method: 'PATCH', path: `/api/tools/${ID.tool}`, body: {} },
  { name: 'tools.delete', perm: 'tools.delete', method: 'DELETE', path: `/api/tools/${ID.tool}`, body: {} },
  { name: 'tools.count', perm: 'tools.count', method: 'POST', path: `/api/shifts/${ID.shift}/tool-counts`, body: {} },
  { name: 'shifts.open', perm: 'shifts.open', method: 'POST', path: '/api/shifts', body: { openingCash: -1 } },
  { name: 'shifts.close', perm: 'shifts.close', method: 'POST', path: `/api/shifts/${ID.shift}/close`, body: {} },
  { name: 'cashflows.create', perm: 'cashflows.create', method: 'POST', path: '/api/cashflows', body: {} },
  { name: 'cashflows.edit', perm: 'cashflows.edit', method: 'PUT', path: `/api/cashflows/${ID.cashflow}`, body: {} },
  { name: 'cashflows.delete', perm: 'cashflows.delete', method: 'DELETE', path: `/api/cashflows/${ID.cashflow}`, body: {} },
  { name: 'users.create', perm: 'users.create', method: 'POST', path: '/api/users', body: {} },
  { name: 'users.edit', perm: 'users.edit', method: 'PUT', path: `/api/users/${ID.user}`, body: {} },
  { name: 'roles.manage (tạo)', perm: 'roles.manage', method: 'POST', path: '/api/roles', body: {} },
  { name: 'roles.manage (sửa)', perm: 'roles.manage', method: 'PUT', path: `/api/roles/${ID.role}`, body: {} },
  { name: 'roles.manage (xóa)', perm: 'roles.manage', method: 'DELETE', path: `/api/roles/${ID.role}`, body: {} },
  { name: 'settings.edit', perm: 'settings.edit', method: 'PUT', path: '/api/settings', body: {} },
  { name: 'students.create', perm: 'students.create', method: 'POST', path: '/api/students', body: {} },
  { name: 'students.edit', perm: 'students.edit', method: 'PUT', path: `/api/students/${ID.student}`, body: {} },
  { name: 'students.delete', perm: 'students.delete', method: 'DELETE', path: `/api/students/${ID.student}`, body: {} },
  { name: 'classes.create', perm: 'classes.create', method: 'POST', path: '/api/classes', body: {} },
  { name: 'classes.edit', perm: 'classes.edit', method: 'PUT', path: `/api/classes/${ID.class}`, body: {} },
  { name: 'classes.delete', perm: 'classes.delete', method: 'DELETE', path: `/api/classes/${ID.class}`, body: {} },
  { name: 'classes.edit (kết thúc)', perm: 'classes.edit', method: 'POST', path: `/api/classes/${ID.class}/end`, body: {} },
  { name: 'series.manage (lịch của lớp)', perm: 'series.manage', method: 'POST', path: `/api/classes/${ID.class}/slots`, body: {} },
  { name: 'series.manage (tạo chuỗi)', perm: 'series.manage', method: 'POST', path: '/api/series', body: {} },
  { name: 'lessons.create', perm: 'lessons.create', method: 'POST', path: '/api/lessons', body: {} },
  { name: 'lessons.edit', perm: 'lessons.edit', method: 'PATCH', path: `/api/lessons/${ID.lesson}`, body: {} },
  { name: 'lessons.delete', perm: 'lessons.delete', method: 'DELETE', path: `/api/lessons/${ID.lesson}`, body: {} },
  { name: 'lessons.edit (điểm danh)', perm: 'lessons.edit', method: 'POST', path: `/api/lessons/${ID.lesson}/attendance`, body: {} },
  { name: 'lessons.edit (ghi chú)', perm: 'lessons.edit', method: 'PATCH', path: `/api/lessons/${ID.lesson}/notes`, body: {} },
]

const CASHIER_PERMISSIONS = [
  'sessions.view',
  'sessions.checkin',
  'sessions.checkout',
  'sessions.sell',
  'shifts.open',
  'shifts.close',
  'bookings.view',
  'bookings.create',
  'bookings.confirm',
  'bookings.cancel',
  'customers.view',
]
const TEACHER_PERMISSIONS = ['students.view', 'classes.view', 'lessons.view']

// ── Tiện ích ─────────────────────────────────────────────
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function csrfOf(ctx: APIRequestContext): Promise<string> {
  const state = await ctx.storageState()
  return state.cookies.find((cookie) => cookie.name === CSRF_COOKIE)?.value ?? ''
}

async function call(
  ctx: APIRequestContext,
  method: string,
  path: string,
  body?: unknown,
) {
  const headers: Record<string, string> = {}
  if (method !== 'GET') headers[CSRF_HEADER] = await csrfOf(ctx)
  return ctx.fetch(path, { method, data: body, headers })
}

async function newUserContext(username: string, password: string): Promise<APIRequestContext> {
  const ctx = await pwRequest.newContext({ baseURL: BASE })
  const response = await ctx.post('/api/auth/login', { data: { username, password } })
  expect(response.status(), `đăng nhập ${username}`).toBe(200)
  return ctx
}

/** Probe dương: bắn 30 request liền lên Supabase free tier có thể dính
 * read-timeout tạm thời → thử lại 1 lần. Probe dương đã thiết kế để không tạo
 * dữ liệu (body invalid/not-found) nên retry an toàn. */
async function positiveProbe(
  ctx: APIRequestContext,
  probe: { method: string; path: string; body?: unknown },
) {
  let response = await call(ctx, probe.method, probe.path, probe.body)
  if (response.status() >= 500) {
    await sleep(1_000)
    response = await call(ctx, probe.method, probe.path, probe.body)
  }
  return response
}

async function loginAs(page: Page, username: string, password: string) {
  await page.goto('/login')
  await page.getByPlaceholder('Nhập tên đăng nhập').fill(username)
  await page.getByPlaceholder('Nhập mật khẩu').fill(password)
  const posted = page.waitForResponse(
    (response) => response.url().endsWith('/api/auth/login') && response.request().method() === 'POST',
  )
  await page.getByRole('button', { name: 'Đăng nhập' }).click()
  expect((await posted).status()).toBe(200)
}

interface Fixture {
  suffix: string
  password: string
  roles: { zero: string; all: string; cashier: string; teacher: string; admin: string }
  users: { zero: string; all: string; cashier: string; teacher: string; noRole: string }
  admin: APIRequestContext
  ctxZero: APIRequestContext
  ctxAll: APIRequestContext
}

let fx: Fixture

test.describe.configure({ timeout: 180_000 })

test.beforeAll(async () => {
  // Chờ window rate-limit rỗng — mutation của spec chạy trước đó (admin-catalog)
  // tính chung IP nên cửa sổ mới đảm bảo lô setup không bị 429.
  await sleep(MUTATION_WINDOW_MS)

  const admin = await pwRequest.newContext({ baseURL: BASE })
  const credentials = loadCredentials()
  const login = await admin.post('/api/auth/login', { data: credentials })
  expect(login.status(), await login.text()).toBe(200)

  const suffix = Date.now().toString(36) + Math.random().toString(16).slice(2, 6)
  const password = 'e2e-secret-123'

  async function createRole(label: string, permissions: string[]): Promise<string> {
    const response = await call(admin, 'POST', '/api/roles', {
      name: `[E2E] ${label} ${suffix}`,
      permissions,
    })
    expect(response.status(), await response.text()).toBe(201)
    return ((await response.json()) as { data: { id: string } }).data.id
  }

  async function createUser(name: string, roleId: string | null): Promise<string> {
    const response = await call(admin, 'POST', '/api/users', {
      username: `e2e_perm_${name}_${suffix}`,
      password,
      fullName: `E2E ${name}`,
      roleId,
    })
    expect(response.status(), await response.text()).toBe(201)
    return ((await response.json()) as { data: { id: string } }).data.id
  }

  const zero = await createRole('Không quyền', [])
  const all = await createRole('Toàn quyền', ALL_PERMISSIONS)
  const cashier = await createRole('Thu ngân', CASHIER_PERMISSIONS)
  const teacher = await createRole('Giáo viên', TEACHER_PERMISSIONS)

  const rolesResponse = await admin.get('/api/roles')
  const roleRows = ((await rolesResponse.json()) as { data: Array<{ id: string; key: string | null }> }).data
  const adminRoleId = roleRows.find((role) => role.key === 'ADMIN')?.id
  expect(adminRoleId, 'không thấy role hệ thống ADMIN').toBeTruthy()

  const users = {
    zero: `e2e_perm_zero_${suffix}`,
    all: `e2e_perm_all_${suffix}`,
    cashier: `e2e_perm_cashier_${suffix}`,
    teacher: `e2e_perm_teacher_${suffix}`,
    noRole: `e2e_perm_norole_${suffix}`,
  }

  await createUser('zero', zero)
  await createUser('all', all)
  await createUser('cashier', cashier)
  await createUser('teacher', teacher)
  await createUser('norole', null)

  fx = {
    suffix,
    password,
    roles: { zero, all, cashier, teacher, admin: adminRoleId! },
    users,
    admin,
    ctxZero: await newUserContext(users.zero, password),
    ctxAll: await newUserContext(users.all, password),
  }
})

test.afterAll(async () => {
  await fx?.ctxZero?.dispose()
  await fx?.ctxAll?.dispose()
  await fx?.admin?.dispose()

  await execFileAsync('./node_modules/.bin/tsx', ['e2e/permissions-data.ts', 'cleanup'], {
    cwd: process.cwd(),
    env: process.env,
  })
})

// ── 1. Chặn quyền: role 0 quyền ─────────────────────────

test('role 0 quyền: mọi endpoint ĐỌC có gate trả 403', async ({}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Sweep API chỉ chạy 1 lần (desktop)')
  for (const probe of READS) {
    const response = await fx.ctxZero.get(probe.path)
    expect(response.status(), `GET ${probe.path} (${probe.name}) phải 403`).toBe(403)
  }
})

test('role 0 quyền: lô GHI 1/3 trả 403', async ({}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Sweep API chỉ chạy 1 lần (desktop)')
  for (const probe of MUTATIONS.slice(0, 20)) {
    const response = await call(fx.ctxZero, probe.method, probe.path, probe.body)
    expect(response.status(), `${probe.method} ${probe.path} (${probe.name}) phải 403`).toBe(403)
  }
})

test('role 0 quyền: lô GHI 2/3 trả 403', async ({}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Sweep API chỉ chạy 1 lần (desktop)')
  await sleep(MUTATION_WINDOW_MS)
  for (const probe of MUTATIONS.slice(20, 50)) {
    const response = await call(fx.ctxZero, probe.method, probe.path, probe.body)
    expect(response.status(), `${probe.method} ${probe.path} (${probe.name}) phải 403`).toBe(403)
  }
})

test('role 0 quyền: lô GHI 3/3 trả 403', async ({}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Sweep API chỉ chạy 1 lần (desktop)')
  await sleep(MUTATION_WINDOW_MS)
  for (const probe of MUTATIONS.slice(50)) {
    const response = await call(fx.ctxZero, probe.method, probe.path, probe.body)
    expect(response.status(), `${probe.method} ${probe.path} (${probe.name}) phải 403`).toBe(403)
  }
})

// ── 2. Đi qua gate: role toàn quyền ─────────────────────

test('role toàn quyền: mọi endpoint ĐỌC trả 200', async ({}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Sweep API chỉ chạy 1 lần (desktop)')
  for (const probe of READS) {
    const response = await fx.ctxAll.get(probe.path)
    expect(response.status(), `GET ${probe.path} (${probe.name}) phải 200`).toBe(200)
  }
})

test('role toàn quyền: lô GHI 1/2 đi qua gate (không 403/5xx)', async ({}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Sweep API chỉ chạy 1 lần (desktop)')
  await sleep(MUTATION_WINDOW_MS)
  // Mỗi quyền một đại diện đầu tiên; body đã chọn để dừng ở validation/not-found.
  const firstPerPermission = [...MUTATIONS.reduce((map, probe) => {
    if (!map.has(probe.perm)) map.set(probe.perm, probe)
    return map
  }, new Map<string, (typeof MUTATIONS)[number]>()).values()]

  for (const probe of firstPerPermission.slice(0, 27)) {
    const response = await positiveProbe(fx.ctxAll, probe)
    const status = response.status()
    expect(status, `${probe.method} ${probe.path} (${probe.name}) không được 403`).not.toBe(403)
    expect(status, `${probe.method} ${probe.path} (${probe.name}) không được 5xx`).toBeLessThan(500)
    await sleep(100)
  }
})

test('role toàn quyền: lô GHI 2/2 đi qua gate (không 403/5xx)', async ({}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Sweep API chỉ chạy 1 lần (desktop)')
  await sleep(MUTATION_WINDOW_MS)
  const firstPerPermission = [...MUTATIONS.reduce((map, probe) => {
    if (!map.has(probe.perm)) map.set(probe.perm, probe)
    return map
  }, new Map<string, (typeof MUTATIONS)[number]>()).values()]

  for (const probe of firstPerPermission.slice(27)) {
    const response = await positiveProbe(fx.ctxAll, probe)
    const status = response.status()
    expect(status, `${probe.method} ${probe.path} (${probe.name}) không được 403`).not.toBe(403)
    expect(status, `${probe.method} ${probe.path} (${probe.name}) không được 5xx`).toBeLessThan(500)
    await sleep(100)
  }
})

// ── 3. Role ADMIN hệ thống bị khoá ──────────────────────

test('role ADMIN hệ thống: không sửa/xoá được qua API', async ({}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Sweep API chỉ chạy 1 lần (desktop)')
  const put = await call(fx.admin, 'PUT', `/api/roles/${fx.roles.admin}`, { name: 'Đổi tên' })
  expect(put.status()).toBe(403)
  expect(((await put.json()) as { code?: string }).code).toBe('ROLE_LOCKED')

  const del = await call(fx.admin, 'DELETE', `/api/roles/${fx.roles.admin}`)
  expect(del.status()).toBe(403)
  expect(((await del.json()) as { code?: string }).code).toBe('ROLE_LOCKED')
})

// ── 4. Xoá role → user về "Chưa phân vai" ───────────────

test('xoá role đang gán: user chuyển sang "Chưa phân vai" ngay (auth đọc DB)', async ({}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Sweep API chỉ chạy 1 lần (desktop)')

  const before = await fx.ctxZero.get('/api/auth/me')
  expect(((await before.json()) as { data: { role: { id: string } | null } }).data.role?.id).toBe(fx.roles.zero)

  const del = await call(fx.admin, 'DELETE', `/api/roles/${fx.roles.zero}`)
  expect(del.status(), await del.text()).toBe(200)
  const body = (await del.json()) as { success: boolean; data?: { message?: string } }
  expect(body.data?.message ?? '').toContain('Chưa phân vai')

  // JWT cũ vẫn hợp lệ nhưng quyền đọc lại từ DB mỗi request (cache user TTL 30s)
  await expect
    .poll(
      async () => {
        const after = await fx.ctxZero.get('/api/auth/me')
        const body = (await after.json()) as { data: { role: unknown } }
        return body.data.role
      },
      { timeout: 45_000, message: 'role phải về null sau khi role bị xoá (hết cache 30s)' },
    )
    .toBeNull()

  const blocked = await fx.ctxZero.get('/api/sessions')
  expect(blocked.status()).toBe(403)
})

// ── 5. UI theo role ─────────────────────────────────────

test('UI thu ngân: nav chỉ nhóm có quyền, /reports bị đẩy về', async ({ page }) => {
  await loginAs(page, fx.users.cashier, fx.password)

  await expect(page).toHaveURL(/\/sessions/)
  await expect(page.locator('a[href="/bookings"]:visible').first()).toBeVisible()
  await expect(page.locator('a[href="/reports"]')).toHaveCount(0)
  await expect(page.locator('a[href="/inventory"]')).toHaveCount(0)

  await page.goto('/reports')
  await expect(page).toHaveURL(/\/sessions/)

  const api = await page.request.get('/api/reports/dashboard')
  expect(api.status()).toBe(403)
})

test('UI giáo viên: nav đào tạo, mở /sessions bị đưa về module đào tạo', async ({ page }) => {
  await loginAs(page, fx.users.teacher, fx.password)

  // /sessions bị guard đẩy về module đầu tiên giáo viên vào được (students)
  await expect(page).toHaveURL(/\/(students|lessons|classes)/, { timeout: 20_000 })
  await expect(page.locator('a[href="/lessons"]:visible').first()).toBeVisible()
  await expect(page.locator('a[href="/classes"]:visible').first()).toBeVisible()
  await expect(page.locator('a[href="/bookings"]')).toHaveCount(0)
})

test('UI chưa phân vai: màn chờ phân quyền + đăng xuất được', async ({ page }) => {
  await loginAs(page, fx.users.noRole, fx.password)

  await expect(page.getByRole('heading', { name: 'Tài khoản chưa được phân vai trò' })).toBeVisible({
    timeout: 20_000,
  })
  await expect(page.getByText(/liên hệ quản trị viên/)).toBeVisible()

  await page.getByRole('button', { name: 'Đăng xuất' }).click()
  await expect(page).toHaveURL(/\/login/)
})

test('UI admin: trang Vai trò hiển thị ADMIN khoá "Hệ thống"', async ({ page }) => {
  const credentials = loadCredentials()
  await loginAs(page, credentials.username, credentials.password)

  await page.goto('/roles')
  await expect(page.getByText('Hệ thống').filter({ visible: true }).first()).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText('Quản trị viên').filter({ visible: true }).first()).toBeVisible()
})
