import { describe, it, expect, beforeAll } from 'vitest'
import { SignJWT } from 'jose'
import { NextRequest } from 'next/server'

// proxy.ts ném ngay khi thiếu SESSION_SECRET — set trước khi import động.
const SECRET = 'test-secret-for-proxy-test-0123456789abcdef'
process.env.SESSION_SECRET = SECRET

type Proxy = typeof import('@/proxy')['proxy']

let proxy: Proxy
const encoder = new TextEncoder()

beforeAll(async () => {
  ;({ proxy } = await import('@/proxy'))
})

async function requestFor(role: string, pathname: string) {
  const token = await new SignJWT({ role, userId: 'user-1' })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('1h')
    .sign(encoder.encode(SECRET))

  const request = new NextRequest(`https://club.test${pathname}`, {
    headers: { cookie: `qltrungcung_session=${token}` },
  })
  return proxy(request)
}

describe('proxy — giáo viên chỉ mở được module Đào tạo + tab Thêm', () => {
  it.each([
    '/settings',
    '/api/auth/me',
    '/lessons',
    '/classes',
    '/students/abc',
    '/api/lessons',
  ])('%s đi qua được', async (pathname) => {
    const response = await requestFor('TEACHER', pathname)
    expect(response.headers.get('location')).toBeNull()
    expect(response.headers.get('x-middleware-next')).toBe('1')
  })

  it('/sessions bị đưa về /lessons', async () => {
    const response = await requestFor('TEACHER', '/sessions')
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('https://club.test/lessons')
  })

  it('API ngoài Đào tạo trả 403 thay vì chạy', async () => {
    const response = await requestFor('TEACHER', '/api/shifts?current=true')
    expect(response.status).toBe(403)
  })
})

describe('proxy — vai trò khác', () => {
  it.each(['ADMIN', 'MANAGER', 'STAFF'])('%s mở được /settings', async (role) => {
    const response = await requestFor(role, '/settings')
    expect(response.headers.get('x-middleware-next')).toBe('1')
  })
})
