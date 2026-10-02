// Generic fetch helpers used across features.
import type { ApiResponse } from '@/types'
import { CSRF_HEADER, CSRF_COOKIE } from '@/lib/shared/constants'

function getCSRFToken(): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${CSRF_COOKIE}=([^;]*)`)
  )
  return match ? decodeURIComponent(match[1]) : null
}

export async function apiJson<T>(
  url: string,
  init?: RequestInit
): Promise<ApiResponse<T>> {
  const method = (init?.method || 'GET').toUpperCase()

  // Tự động thêm CSRF token cho mutation requests
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    const csrfToken = getCSRFToken()
    if (csrfToken) {
      const headers = new Headers(init?.headers)
      if (!headers.has(CSRF_HEADER)) {
        headers.set(CSRF_HEADER, csrfToken)
      }
      init = { ...init, headers }
    }
  }

  const response = await fetch(url, init)

  try {
    return (await response.json()) as ApiResponse<T>
  } catch {
    // Body không phải JSON: 405 (route không có method này), 404, 502 của proxy…
    // Ném ra ở đây sẽ rơi vào catch chung và mọi màn đều hiện "Lỗi kết nối máy
    // chủ" — che mất nguyên nhân thật. Trả về đúng shape ApiResponse để UI hiện
    // số HTTP, từ đó thấy ngay là sai đường dẫn hay sai method.
    return {
      success: false,
      code: 'HTTP_ERROR',
      error: `Máy chủ trả về ${response.status} — kiểm tra lại đường dẫn API`,
    }
  }
}

export function jsonRequest(body: unknown): RequestInit {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }

  // CSRF token từ cookie (client-side only)
  if (typeof document !== 'undefined') {
    const match = document.cookie.match(
      new RegExp(`(?:^|;\\s*)${CSRF_COOKIE}=([^;]*)`)
    )
    if (match) {
      headers[CSRF_HEADER] = decodeURIComponent(match[1])
    }
  }

  return {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  }
}
