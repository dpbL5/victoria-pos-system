// ── Use-case: pause / resume session ─────
import { err } from '@/lib/shared/result'
import type { DomainError, Result } from '@/lib/shared/result'
import { runInTransaction } from '@/lib/infrastructure/db-helpers'
import type { Repositories } from '@/lib/infrastructure/repositories'
import { repositories } from '@/lib/infrastructure/repositories'
import type { HttpErrorInfo } from '@/lib/infrastructure/api-helpers'

export interface PauseSessionInput {
  sessionId: string
  staffId: string
  now?: Date
}

export interface ResumeSessionInput {
  sessionId: string
  staffId: string
  now?: Date
}

export interface PauseSessionResult {
  sessionId: string
  pausedAt: Date
}

export interface ResumeSessionResult {
  sessionId: string
  pausedSeconds: number
}

/**
 * Tạm dừng phiên chơi: set pausedAt → trạng thái dẫn xuất "đang tạm dừng".
 * Chỉ áp dụng khi session đang ACTIVE và chưa paused.
 */
export async function pauseSession(
  input: PauseSessionInput,
  deps: Repositories = repositories
): Promise<Result<PauseSessionResult>> {
  const { sessionId, staffId, now = new Date() } = input

  const session = await deps.session.findByIdForCheckout(sessionId)
  if (!session) return err('SESSION_NOT_FOUND')
  if (session.status !== 'ACTIVE') return err('SESSION_NOT_ACTIVE')
  if (session.pausedAt) return err('SESSION_ALREADY_PAUSED')

  const result = await runInTransaction(async (tx) => {
    await tx.session.update(sessionId, { pausedAt: now })
    await tx.audit.append({
      userId: staffId,
      action: 'SESSION_PAUSE',
      entityType: 'Session',
      entityId: sessionId,
      details: { pausedAt: now.toISOString() },
    })
    return { sessionId, pausedAt: now }
  })

  return result
}

/**
 * Tiếp tục phiên chơi sau tạm dừng: cộng dồn thời gian đã pause vào `totalPausedSeconds`,
 * set `pausedAt = null`.
 * Chỉ áp dụng khi session đang ACTIVE và đã paused.
 */
export async function resumeSession(
  input: ResumeSessionInput,
  deps: Repositories = repositories
): Promise<Result<ResumeSessionResult>> {
  const { sessionId, staffId, now = new Date() } = input

  const session = await deps.session.findByIdForCheckout(sessionId)
  if (!session) return err('SESSION_NOT_FOUND')
  if (session.status !== 'ACTIVE') return err('SESSION_NOT_ACTIVE')
  if (!session.pausedAt) return err('SESSION_NOT_PAUSED')

  const pausedSeconds = Math.round(Math.max(0, (now.getTime() - new Date(session.pausedAt).getTime())) / 1000)

  const result = await runInTransaction(async (tx) => {
    await tx.session.update(sessionId, {
      pausedAt: null,
      totalPausedSeconds: { increment: pausedSeconds },
    })
    await tx.audit.append({
      userId: staffId,
      action: 'SESSION_RESUME',
      entityType: 'Session',
      entityId: sessionId,
      details: { pausedSeconds, resumedAt: now.toISOString() },
    })
    return { sessionId, pausedSeconds }
  })

  return result
}

export function mapPauseSessionError(error: DomainError): HttpErrorInfo {
  switch (error.code) {
    case 'SESSION_NOT_FOUND':
      return { code: 'SESSION_NOT_FOUND', message: 'Không tìm thấy phiên', status: 404 }
    case 'SESSION_NOT_ACTIVE':
      return { code: 'SESSION_NOT_ACTIVE', message: 'Chỉ tạm dừng được phiên đang chơi', status: 400 }
    case 'SESSION_ALREADY_PAUSED':
      return { code: 'SESSION_ALREADY_PAUSED', message: 'Phiên đã tạm dừng rồi', status: 400 }
    default:
      return { code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 }
  }
}

export function mapResumeSessionError(error: DomainError): HttpErrorInfo {
  switch (error.code) {
    case 'SESSION_NOT_FOUND':
      return { code: 'SESSION_NOT_FOUND', message: 'Không tìm thấy phiên', status: 404 }
    case 'SESSION_NOT_ACTIVE':
      return { code: 'SESSION_NOT_ACTIVE', message: 'Chỉ tiếp tục được phiên đang chơi', status: 400 }
    case 'SESSION_NOT_PAUSED':
      return { code: 'SESSION_NOT_PAUSED', message: 'Phiên chưa tạm dừng', status: 400 }
    default:
      return { code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 }
  }
}
