// ── Use-cases: kết nối Google Calendar (1 calendar CLB dùng chung) ─────
import { err, ok } from '@/lib/shared/result'
import type { DomainError, Result } from '@/lib/shared/result'
import { runInTransaction } from '@/lib/infrastructure/db-helpers'
import type { HttpErrorInfo } from '@/lib/infrastructure/api-helpers'
import type { Repositories } from '@/lib/infrastructure/repositories'
import { repositories } from '@/lib/infrastructure/repositories'
import { exchangeCodeForTokens } from '@/lib/google'
import type { CalendarConnectionRecord } from '../ports'

export interface ConnectCalendarInput {
  staffId: string
  code: string
  email?: string
}

export async function connectCalendar(input: ConnectCalendarInput): Promise<Result<CalendarConnectionRecord>> {
  let tokens: { access_token: string; refresh_token?: string; expires_in: number }
  try {
    tokens = await exchangeCodeForTokens(input.code)
  } catch {
    return err('GOOGLE_TOKEN_EXCHANGE_FAILED')
  }

  const refreshToken = tokens.refresh_token
  if (!refreshToken) {
    return err('GOOGLE_REFRESH_TOKEN_MISSING')
  }

  const tokenExpiresAt = new Date(Date.now() + tokens.expires_in * 1000)

  const result = await runInTransaction(async (tx) => {
    const conn = await tx.calendarConnection.upsert({
      email: input.email || 'Google Calendar',
      accessToken: tokens.access_token,
      refreshToken,
      tokenExpiresAt,
      calendarId: null,
    })

    await tx.audit.append({
      userId: input.staffId,
      action: 'GOOGLE_CALENDAR_CONNECT',
      entityType: 'CalendarConnection',
      entityId: conn.id,
      details: { email: conn.email },
    })

    return conn
  })

  return result
}

export interface DisconnectCalendarInput {
  staffId: string
}

export async function disconnectCalendar(
  input: DisconnectCalendarInput,
  deps: Repositories = repositories
): Promise<Result<{ deleted: boolean }>> {
  const conn = await deps.calendarConnection.find()
  if (!conn) return ok({ deleted: false })

  const result = await runInTransaction(async (tx) => {
    await tx.calendarConnection.delete(conn.id)

    await tx.audit.append({
      userId: input.staffId,
      action: 'GOOGLE_CALENDAR_DISCONNECT',
      entityType: 'CalendarConnection',
      entityId: conn.id,
    })

    return { deleted: true }
  })

  return result
}

export interface CalendarStatus {
  connected: boolean
  email?: string
  calendarId?: string | null
  connectedAt?: string
}

export async function getCalendarStatus(
  deps: Repositories = repositories
): Promise<Result<CalendarStatus>> {
  const conn = await deps.calendarConnection.find()
  if (!conn) return ok({ connected: false })
  return ok({
    connected: true,
    email: conn.email,
    calendarId: conn.calendarId,
    connectedAt: conn.connectedAt.toISOString(),
  })
}

export function mapConnectCalendarError(error: DomainError): HttpErrorInfo {
  switch (error.code) {
    case 'GOOGLE_TOKEN_EXCHANGE_FAILED':
      return { code: 'GOOGLE_TOKEN_EXCHANGE_FAILED', message: 'Không kết nối được Google (mã xác thực không hợp lệ)', status: 400 }
    case 'GOOGLE_REFRESH_TOKEN_MISSING':
      return { code: 'GOOGLE_REFRESH_TOKEN_MISSING', message: 'Google không cấp refresh token — cần kết nối lại với quyền offline', status: 400 }
    default:
      return { code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 }
  }
}
