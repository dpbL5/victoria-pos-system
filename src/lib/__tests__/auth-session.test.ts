import { expect, it, vi } from 'vitest'
import { jwtVerify } from 'jose'

const cookieStore = vi.hoisted(() => ({ set: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: async () => cookieStore }))
vi.mock('@/lib/infrastructure/prisma', () => ({ prisma: {} }))
vi.stubEnv('SESSION_SECRET', 'test-session-secret-at-least-32-characters-long')

it('JWT, cookie đăng nhập và CSRF cùng hết hạn sau 7 ngày', async () => {
  const { createSession } = await import('@/lib/shared/auth')
  const token = await createSession({
    userId: 'staff-1', username: 'staff', fullName: 'Nhân viên', role: 'STAFF',
  })
  const { payload } = await jwtVerify(token, new TextEncoder().encode(process.env.SESSION_SECRET))

  expect(payload.exp! - payload.iat!).toBe(604800)
  expect(cookieStore.set).toHaveBeenCalledWith('qltrungcung_session', token, expect.objectContaining({
    maxAge: 604800, httpOnly: true, sameSite: 'lax', path: '/',
  }))
  expect(cookieStore.set).toHaveBeenCalledWith('qltrungcung_csrf', expect.any(String), expect.objectContaining({
    maxAge: 604800, httpOnly: false, sameSite: 'lax', path: '/',
  }))
  vi.unstubAllEnvs()
})
