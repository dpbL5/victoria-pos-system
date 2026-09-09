import { randomUUID } from 'node:crypto'
// ── Use-cases: kết nối Google Calendar (1 calendar CLB dùng chung) ─────
import { err, ok } from '@/lib/shared/result'
import type { DomainError, Result } from '@/lib/shared/result'
import { fail, runInTransaction } from '@/lib/infrastructure/db-helpers'
import type { HttpErrorInfo } from '@/lib/infrastructure/api-helpers'
import type { Repositories } from '@/lib/infrastructure/repositories'
import { repositories } from '@/lib/infrastructure/repositories'
import type { CalendarConnectionRecord } from '../ports'

export interface ConnectCalendarInput {
  staffId: string
  code: string
  email?: string
}

export async function connectCalendar(input: ConnectCalendarInput, deps: Repositories = repositories): Promise<Result<CalendarConnectionRecord>> {
  let tokens: { access_token: string; refresh_token?: string; expires_in: number }
  try {
    tokens = await deps.googleCalendar.exchangeCode(input.code)
  } catch {
    return err('GOOGLE_TOKEN_EXCHANGE_FAILED')
  }

  const refreshToken = tokens.refresh_token
  if (!refreshToken) {
    return err('GOOGLE_REFRESH_TOKEN_MISSING')
  }

  const tokenExpiresAt = new Date(Date.now() + tokens.expires_in * 1000)

  const result = await runInTransaction(async (tx) => {
    const previous = await tx.calendarConnection.find()
    if (previous?.leaseUntil && previous.leaseUntil > new Date()) fail('CALENDAR_BUSY')
    const conn = await tx.calendarConnection.upsert({
      email: input.email || 'Google Calendar',
      accessToken: deps.googleCalendar.encrypt(tokens.access_token),
      refreshToken: deps.googleCalendar.encrypt(refreshToken),
      needsReconnect: false,
      tokenExpiresAt,
      calendarId: null,
      generation: randomUUID(),
    })

    await tx.audit.append({
      userId: input.staffId,
      action: 'GOOGLE_CALENDAR_CONNECT',
      entityType: 'CalendarConnection',
      entityId: conn.generation,
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
    const current = await tx.calendarConnection.find()
    if (current?.leaseUntil && current.leaseUntil > new Date()) fail('CALENDAR_BUSY')
    await tx.calendarConnection.delete(conn.id)

    await tx.audit.append({
      userId: input.staffId,
      action: 'GOOGLE_CALENDAR_DISCONNECT',
      entityType: 'CalendarConnection',
      entityId: conn.generation,
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
  needsReconnect?: boolean
  pending?: number
  failed?: number
  lastSyncedAt?: string | null
}

export async function getCalendarStatus(
  deps: Repositories = repositories
): Promise<Result<CalendarStatus>> {
  const conn = await deps.calendarConnection.find()
  if (!conn) return ok({ connected: false })
  const summary = await deps.calendarSync.summary()
  return ok({
    connected: true,
    needsReconnect: conn.needsReconnect,
    pending: summary.pending,
    failed: summary.failed,
    lastSyncedAt: summary.lastSyncedAt?.toISOString() ?? null,
    email: conn.email,
    calendarId: conn.calendarId,
    connectedAt: conn.connectedAt.toISOString(),
  })
}

export function mapConnectCalendarError(error: DomainError): HttpErrorInfo {
  switch (error.code) {
    case 'CALENDAR_BUSY':
      return { code: error.code, message: 'Đang đồng bộ lịch. Hãy thử lại sau một phút', status: 409 }
    case 'GOOGLE_TOKEN_EXCHANGE_FAILED':
      return { code: 'GOOGLE_TOKEN_EXCHANGE_FAILED', message: 'Không kết nối được Google (mã xác thực không hợp lệ)', status: 400 }
    case 'GOOGLE_REFRESH_TOKEN_MISSING':
      return { code: 'GOOGLE_REFRESH_TOKEN_MISSING', message: 'Google không cấp refresh token — cần kết nối lại với quyền offline', status: 400 }
    default:
      return { code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 }
  }
}
