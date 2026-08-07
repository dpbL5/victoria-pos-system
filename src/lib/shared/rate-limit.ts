// ── In-Memory Rate Limiter ──────────────────────────────
// Dùng Map với TTL-based cleanup. Phù hợp cho single-tenant
// POS system, không cần Redis.
//
// Mỗi request từ cùng IP được giới hạn theo sliding window.

const ipWindows = new Map<string, { count: number; resetAt: number }>()

// Cleanup mỗi 5 phút để tránh memory leak
const CLEANUP_INTERVAL = 5 * 60 * 1000
let lastCleanup = Date.now()

function cleanup() {
  const now = Date.now()
  if (now - lastCleanup < CLEANUP_INTERVAL) return
  lastCleanup = now

  for (const [key, entry] of ipWindows) {
    if (now >= entry.resetAt) {
      ipWindows.delete(key)
    }
  }
}

interface RateLimitOptions {
  /** Thời gian window tính bằng giây (mặc định: 60) */
  windowSeconds?: number
  /** Số request tối đa trong window (mặc định: 100) */
  maxRequests?: number
  /** Key prefix để phân biệt các limiter khác nhau */
  prefix?: string
}

interface RateLimitResult {
  ok: boolean
  retryAfter?: number
}

/**
 * Kiểm tra rate limit cho request hiện tại.
 *
 * Trả về `{ ok: true }` nếu chưa vượt giới hạn,
 * hoặc `{ ok: false, retryAfter }` nếu đã bị chặn.
 *
 * @example
 * // API chung: 100 req/phút
 * const rl = await rateLimit(request)
 *
 * // Login: 5 req/phút (đã hardcode trong auth route)
 * const rl = await rateLimit(request, { maxRequests: 5, windowSeconds: 60 })
 */
export async function rateLimit(
  request: Request,
  options: RateLimitOptions = {}
): Promise<RateLimitResult> {
  const { windowSeconds = 60, maxRequests = 100, prefix = 'api' } = options

  cleanup()

  // Lấy IP từ header (hỗ trợ proxy/Vercel) hoặc fallback
  const forwarded = request.headers.get('x-forwarded-for')
  const ip = forwarded?.split(',')[0]?.trim() || '127.0.0.1'
  const key = `${prefix}:${ip}`

  const now = Date.now()
  const existing = ipWindows.get(key)

  if (!existing || now >= existing.resetAt) {
    // Tạo window mới
    ipWindows.set(key, { count: 1, resetAt: now + windowSeconds * 1000 })
    return { ok: true }
  }

  existing.count++

  if (existing.count > maxRequests) {
    const retryAfter = Math.ceil((existing.resetAt - now) / 1000)
    return { ok: false, retryAfter }
  }

  return { ok: true }
}

/**
 * Áp dụng rate limit và trả về NextResponse nếu bị chặn.
 * Tiện ích để dùng trong API routes mà không cần copy-paste code.
 *
 * @returns NextResponse nếu bị chặn, `null` nếu OK
 */
export function rateLimitResponse(retryAfter?: number): Response {
  return new Response(
    JSON.stringify({
      success: false,
      error: `Quá nhiều yêu cầu. Thử lại sau ${retryAfter || 60} giây.`,
    }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(retryAfter || 60),
      },
    }
  )
}
