// ── API response helpers — thống nhất response shape cho route handlers ─────
import { NextResponse } from 'next/server'
import type { DomainError, Result } from '@/lib/shared/result'

export interface HttpErrorInfo {
  code: string
  message: string
  status: number
}

export function apiError(error: HttpErrorInfo): NextResponse {
  return NextResponse.json(
    { success: false, code: error.code, error: error.message },
    { status: error.status }
  )
}

export function apiSuccess<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ success: true, data }, { status })
}

export function resultToResponse<T>(
  result: Result<T>,
  mapper: (error: DomainError) => HttpErrorInfo,
  okStatus = 200
): NextResponse {
  if (result.ok) return apiSuccess(result.value, okStatus)
  return apiError(mapper(result.error))
}

// Auth error constants
export const ERR_UNAUTHORIZED = { code: 'UNAUTHORIZED', message: 'Chưa đăng nhập', status: 401 } as const
export const ERR_FORBIDDEN = { code: 'FORBIDDEN', message: 'Không có quyền', status: 403 } as const
export const ERR_CSRF = { code: 'CSRF_MISMATCH', message: 'Yêu cầu không hợp lệ (CSRF)', status: 403 } as const
