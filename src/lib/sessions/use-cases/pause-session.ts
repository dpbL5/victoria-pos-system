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
    // Đồng bộ xuống player chưa checkout — phiên 1 người cũng có player row,
    // checkout/preview tính pause theo player nên cần dữ liệu tại đây.
    await tx.session.pausePlayersForSession(sessionId, now)
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
    // Đồng bộ xuống player chưa checkout — cùng khoảng pause, cùng lúc resume.
    await tx.session.resumePlayersForSession(sessionId, pausedSeconds)
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

// ── Pause theo từng người chơi (phiên nhiều người) ─────

export interface PausePlayerInput {
  sessionId: string
  playerId: string
  staffId: string
  now?: Date
}

export interface PausePlayerResult {
  sessionId: string
  playerId: string
  pausedAt: Date
}

export interface ResumePlayerInput {
  sessionId: string
  playerId: string
  staffId: string
  now?: Date
}

export interface ResumePlayerResult {
  sessionId: string
  playerId: string
  pausedSeconds: number
}

/** Tìm player trong session (qua pricingGroups) — trả null nếu không thuộc session */
function findPlayerInSession(
  session: { pricingGroups: Array<{ players: Array<{ id: string; pausedAt: Date | null; totalPausedSeconds: number }> }> },
  playerId: string
) {
  for (const group of session.pricingGroups) {
    const player = group.players.find((p) => p.id === playerId)
    if (player) return player
  }
  return null
}

/**
 * Tạm dừng 1 người chơi trong phiên nhiều người — set pausedAt trên SessionPlayer.
 * Chỉ hỗ trợ phiên nhiều người (playerCount > 1 / nhiều pricing group):
 * phiên 1 người dùng pauseSession (toàn phiên) như trước.
 */
export async function pausePlayer(
  input: PausePlayerInput,
  deps: Repositories = repositories
): Promise<Result<PausePlayerResult>> {
  const { sessionId, playerId, staffId, now = new Date() } = input

  const session = await deps.session.findPlayersForPause(sessionId)
  if (!session) return err('SESSION_NOT_FOUND')
  if (session.status !== 'ACTIVE') return err('SESSION_NOT_ACTIVE')

  const player = findPlayerInSession(session, playerId)
  if (!player) return err('PLAYER_NOT_FOUND')
  if (player.pausedAt) return err('PLAYER_ALREADY_PAUSED')

  const result = await runInTransaction(async (tx) => {
    await tx.session.pausePlayer(playerId, now)
    await tx.audit.append({
      userId: staffId,
      action: 'PLAYER_PAUSE',
      entityType: 'SessionPlayer',
      entityId: playerId,
      details: { sessionId, pausedAt: now.toISOString() },
    })
    return { sessionId, playerId, pausedAt: now }
  })

  return result
}

/**
 * Tiếp tục 1 người chơi sau tạm dừng — cộng dồn thời gian pause vào
 * totalPausedSeconds của player, set pausedAt = null.
 */
export async function resumePlayer(
  input: ResumePlayerInput,
  deps: Repositories = repositories
): Promise<Result<ResumePlayerResult>> {
  const { sessionId, playerId, staffId, now = new Date() } = input

  const session = await deps.session.findPlayersForPause(sessionId)
  if (!session) return err('SESSION_NOT_FOUND')
  if (session.status !== 'ACTIVE') return err('SESSION_NOT_ACTIVE')

  const player = findPlayerInSession(session, playerId)
  if (!player) return err('PLAYER_NOT_FOUND')
  if (!player.pausedAt) return err('PLAYER_NOT_PAUSED')

  // Chỉ tính elapsed của lần pause này (giống resumeSession session-level) —
  // totalPausedSeconds cũ đã được increment trong các lần resume trước.
  const pausedSeconds = Math.round(Math.max(0, (now.getTime() - new Date(player.pausedAt).getTime()) / 1000))

  const result = await runInTransaction(async (tx) => {
    await tx.session.resumePlayer(playerId, pausedSeconds)
    await tx.audit.append({
      userId: staffId,
      action: 'PLAYER_RESUME',
      entityType: 'SessionPlayer',
      entityId: playerId,
      details: { sessionId, pausedSeconds, resumedAt: now.toISOString() },
    })
    return { sessionId, playerId, pausedSeconds }
  })

  return result
}

export function mapPausePlayerError(error: DomainError): HttpErrorInfo {
  switch (error.code) {
    case 'SESSION_NOT_FOUND':
      return { code: 'SESSION_NOT_FOUND', message: 'Không tìm thấy phiên', status: 404 }
    case 'SESSION_NOT_ACTIVE':
      return { code: 'SESSION_NOT_ACTIVE', message: 'Chỉ tạm dừng được phiên đang chơi', status: 400 }
    case 'PLAYER_NOT_FOUND':
      return { code: 'PLAYER_NOT_FOUND', message: 'Không tìm thấy người chơi trong phiên', status: 404 }
    case 'PLAYER_ALREADY_PAUSED':
      return { code: 'PLAYER_ALREADY_PAUSED', message: 'Người chơi đã tạm dừng rồi', status: 400 }
    default:
      return { code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 }
  }
}

export function mapResumePlayerError(error: DomainError): HttpErrorInfo {
  switch (error.code) {
    case 'SESSION_NOT_FOUND':
      return { code: 'SESSION_NOT_FOUND', message: 'Không tìm thấy phiên', status: 404 }
    case 'SESSION_NOT_ACTIVE':
      return { code: 'SESSION_NOT_ACTIVE', message: 'Chỉ tiếp tục được phiên đang chơi', status: 400 }
    case 'PLAYER_NOT_FOUND':
      return { code: 'PLAYER_NOT_FOUND', message: 'Không tìm thấy người chơi trong phiên', status: 404 }
    case 'PLAYER_NOT_PAUSED':
      return { code: 'PLAYER_NOT_PAUSED', message: 'Người chơi chưa tạm dừng', status: 400 }
    default:
      return { code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 }
  }
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
