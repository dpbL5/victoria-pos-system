// ── CSRF Protection — Double-Submit Cookie Pattern ──────
//
// Luồng:
// 1. Khi đăng nhập, server tạo CSRF token ngẫu nhiên và set vào cookie
//    `qltrungcung_csrf` (không httpOnly — client cần đọc được).
// 2. Client đọc cookie và gửi lại token trong header `X-CSRF-Token`
//    cho tất cả POST/PUT/DELETE requests.
// 3. Server so sánh giá trị cookie với giá trị header — nếu không khớp
//    hoặc thiếu thì reject với 403.
//
// Cơ chế này dựa trên nguyên lý: attacker từ origin khác không thể
// đọc được cookie `qltrungcung_csrf` (SameSite + CORS), nên không thể
// tạo request với header `X-CSRF-Token` khớp.

import { cookies } from 'next/headers'
import { randomBytes } from 'crypto'
import { CSRF_COOKIE, CSRF_HEADER } from '@/lib/constants'

const TOKEN_BYTES = 32

// ── Generate ─────────────────────────────────────────────
export function generateCSRFToken(): string {
  return randomBytes(TOKEN_BYTES).toString('hex')
}

// ── Set cookie ───────────────────────────────────────────
export async function setCSRFCookie(token: string): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.set(CSRF_COOKIE, token, {
    httpOnly: false,       // Client cần đọc bằng JS
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 8,  // 8 giờ — khớp session
  })
}

// ── Clear cookie ─────────────────────────────────────────
export async function clearCSRFCookie(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(CSRF_COOKIE)
}

// ── Validate CSRF ────────────────────────────────────────
// Dùng cho tất cả POST/PUT/DELETE API routes.
// Ném "CSRF_MISMATCH" nếu token không khớp.
export async function validateCSRF(request: Request): Promise<void> {
  const cookieStore = await cookies()
  const cookieToken = cookieStore.get(CSRF_COOKIE)?.value
  const headerToken = request.headers.get(CSRF_HEADER)

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    throw new Error('CSRF_MISMATCH')
  }
}

// ── CSRF header name (export cho client) ─────────────────
export { CSRF_HEADER, CSRF_COOKIE }
