// ── Use-case: renamePlayer — đổi tên 1 người chơi trong phiên ACTIVE ─────
import { err, ok } from '@/lib/shared/result'
import type { DomainError, Result } from '@/lib/shared/result'
import { runInTransaction } from '@/lib/infrastructure/db-helpers'
import type { Repositories } from '@/lib/infrastructure/repositories'
import { repositories } from '@/lib/infrastructure/repositories'
import type { HttpErrorInfo } from '@/lib/infrastructure/api-helpers'

export interface RenamePlayerInput {
  sessionId: string
  playerId: string
  staffId: string
  role: 'ADMIN' | 'STAFF'
  /** Tên mới — đã trim; rỗng/undefined → xoá tên (UI fallback "Người N") */
  name?: string | null
}

export interface RenamePlayerResult {
  id: string
  name: string | null
}

/**
 * Đổi tên 1 người chơi trong phiên đang chơi. Chỉ update `name` trên SessionPlayer,
 * giữ nguyên `id` — định danh duy nhất gắn timer, pause và pricing riêng của player.
 */
export async function renamePlayer(
  input: RenamePlayerInput,
  deps: Repositories = repositories
): Promise<Result<RenamePlayerResult>> {
  const { sessionId, playerId, staffId, role } = input
  // Tên đã trim ở route; rỗng → null để UI fallback "Người N"
  const newName = input.name?.trim() || null

  // Tải session kèm players (đủ name cho audit + staffId/shiftId cho IDOR)
  const session = await deps.session.findByIdWithPlayers(sessionId)
  if (!session) return err('SESSION_NOT_FOUND')
  if (session.status !== 'ACTIVE') return err('SESSION_NOT_ACTIVE')

  // IDOR: STAFF chỉ đổi tên được player trong phiên mình tạo hoặc trong ca mình tham gia
  if (role !== 'ADMIN') {
    const isOwner = session.staffId === staffId
    const isParticipant = session.shiftId
      ? Boolean(await deps.shift.findByIdAccess(session.shiftId))
      : false
    if (!isOwner && !isParticipant) return err('FORBIDDEN')
  }

  // Tìm player trong các pricing group — trả null nếu không thuộc session
  const existing = session.pricingGroups
    .flatMap((g) => g.players)
    .find((p) => p.id === playerId)
  if (!existing) return err('PLAYER_NOT_FOUND')

  const result = await runInTransaction(async (tx) => {
    await tx.session.renamePlayer(playerId, newName)
    await tx.audit.append({
      userId: staffId,
      action: 'PLAYER_RENAME',
      entityType: 'SessionPlayer',
      entityId: playerId,
      details: {
        sessionId,
        previousName: existing.name ?? null,
        newName,
      },
    })
    return { id: playerId, name: newName }
  })

  if (!result.ok) return result
  return ok(result.value)
}

export function mapRenamePlayerError(error: DomainError): HttpErrorInfo {
  switch (error.code) {
    case 'SESSION_NOT_FOUND':
      return { code: 'SESSION_NOT_FOUND', message: 'Không tìm thấy phiên', status: 404 }
    case 'SESSION_NOT_ACTIVE':
      return { code: 'SESSION_NOT_ACTIVE', message: 'Chỉ đổi tên được người chơi trong phiên đang chơi', status: 400 }
    case 'FORBIDDEN':
      return { code: 'FORBIDDEN', message: 'Không có quyền truy cập phiên này', status: 403 }
    case 'PLAYER_NOT_FOUND':
      return { code: 'PLAYER_NOT_FOUND', message: 'Không tìm thấy người chơi trong phiên', status: 404 }
    default:
      return { code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 }
  }
}
