// ── Helper dùng chung cho integration API test ─────
// Không tự mock gì ở đây (vi.mock phải nằm trong từng file test vì hoisting).
// Chỉ cung cấp tiện ích gọi route handler + parse response.
import { NextRequest } from 'next/server'

/** Tham số route handler dạng Next.js 16: params là Promise */
export interface RouteParams {
  id?: string
  playerId?: string
}

/**
 * Gọi một route handler (POST/GET/PUT/DELETE) với body JSON và params.
 * Trả về { status, json } để assert hợp đồng HTTP.
 */
export async function invoke(
  handler: (req: NextRequest, ctx: { params: Promise<RouteParams> }) => Promise<Response>,
  opts: { method?: string; body?: unknown; params?: RouteParams } = {}
): Promise<{ status: number; json: { success: boolean; [key: string]: unknown } }> {
  const { method = 'POST', body, params = {} } = opts

  const req = new NextRequest('http://localhost/api', {
    method,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
  })

  const res = await handler(req, { params: Promise.resolve(params) })
  const json = (await res.json()) as { success: boolean; [key: string]: unknown }
  return { status: res.status, json }
}

/** Payload giả cho mock requireAuth/requireMutationAuth */
export const FAKE_AUTH = {
  userId: 'staff-1',
  username: 'nv_a',
  fullName: 'Nhân viên A',
  role: 'STAFF' as const,
}
