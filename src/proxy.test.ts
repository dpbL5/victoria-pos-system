import { describe, it, expect, beforeAll } from 'vitest'
import { SignJWT } from 'jose'
import { NextRequest } from 'next/server'

// proxy.ts ném ngay khi thiếu SESSION_SECRET — set trước khi import động.
// Proxy chỉ xác thực JWT — phân quyền module do page guard + API guard đảm nhiệm.
const SECRET = 'test-secret-for-proxy-test-0123456789abcdef'
process.env.SESSION_SECRET = SECRET

type Proxy = typeof import('@/proxy')['proxy']

let proxy: Proxy
const encoder = new TextEncoder()

beforeAll(async () => {
  ;({ proxy } = await import('@/proxy'))
})

async function requestFor(pathname: string, token?: string) {
  const headers: Record<string, string> = {}
  if (token) headers.cookie = `qltrungcung_session=${token}`
  const request = new NextRequest(`https://club.test${pathname}`, { headers })
  return proxy(request)
}

async function validToken() {
  return new SignJWT({ userId: 'user-1', roleId: null, roleName: null })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('1h')
    .sign(encoder.encode(SECRET))
}

describe('proxy — xác thực JWT', () => {
  it.each(['/settings', '/lessons', '/sessions', '/reports', '/api/auth/me'])(
    '%s với token hợp lệ đi qua',
    async (pathname) => {
      const response = await requestFor(pathname, await validToken())
      expect(response.headers.get('location')).toBeNull()
      expect(response.headers.get('x-middleware-next')).toBe('1')
    },
  )

  it('public paths đi qua không cần token', async () => {
    for (const pathname of ['/login', '/api/auth/login', '/api/auth/logout']) {
      const response = await requestFor(pathname)
      expect(response.headers.get('x-middleware-next')).toBe('1')
    }
  })

  it('không token + trang → redirect /login kèm callbackUrl nội bộ', async () => {
    const response = await requestFor('/reports')
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('https://club.test/login?callbackUrl=%2Freports')
  })

  it('không token + /api/* → next() (API route tự enforce 401)', async () => {
    const response = await requestFor('/api/shifts?current=true')
    expect(response.headers.get('x-middleware-next')).toBe('1')
  })

  it('token sai chữ ký + trang → redirect /login', async () => {
    const bad = await new SignJWT({ userId: 'user-1' })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('1h')
      .sign(encoder.encode('khac-nhau-hoan-toan-0123456789abcdef'))
    const response = await requestFor('/sessions', bad)
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toContain('/login')
  })
})
