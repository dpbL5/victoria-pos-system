// ── Pause helpers — pure, client-safe (không import Prisma runtime) ─────

/** Pause giây đã tích lũy của 1 player tại thời điểm now (gồm cả đang tạm dừng) */
export function playerPausedSeconds(
  player: { pausedAt: Date | string | null; totalPausedSeconds: number },
  now: Date
): number {
  let seconds = player.totalPausedSeconds
  if (player.pausedAt) {
    seconds += Math.round(Math.max(0, (now.getTime() - new Date(player.pausedAt).getTime())) / 1000)
  }
  return seconds
}

/** Pause giây của 1 group = tổng các player + phần đang tạm dừng */
export function groupPausedSeconds(
  group: { players: Array<{ pausedAt: Date | string | null; totalPausedSeconds: number }> },
  now: Date
): number {
  return group.players.reduce((sum, player) => sum + playerPausedSeconds(player, now), 0)
}

/** Pause giây session-level tại thời điểm now (fallback cho phiên cũ pause toàn phiên) */
export function sessionPauseSeconds(
  session: { pausedAt: Date | string | null; totalPausedSeconds: number },
  now: Date
): number {
  let seconds = session.totalPausedSeconds
  if (session.pausedAt) {
    seconds += Math.round(Math.max(0, (now.getTime() - new Date(session.pausedAt).getTime())) / 1000)
  }
  return seconds
}

/**
 * Pause giây của player được thu, kèm fallback session-level cho phiên 1 người cũ
 * (pause toàn phiên trước đây ghi trên Session, không ghi lên player).
 * Chỉ fallback khi có đúng 1 player chưa checkout và player chưa có pause nào —
 * tránh double-count khi dữ liệu player đã được đồng bộ (phiên mới).
 */
export function playerPauseWithSessionFallback(
  player: { pausedAt: Date | null; totalPausedSeconds: number },
  session: { pausedAt: Date | null; totalPausedSeconds: number },
  now: Date,
  billableCount: number
): number {
  const playerSeconds = playerPausedSeconds(player, now)
  if (billableCount === 1 && playerSeconds === 0) {
    return sessionPauseSeconds(session, now)
  }
  return playerSeconds
}
