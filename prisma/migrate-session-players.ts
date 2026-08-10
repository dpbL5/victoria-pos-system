/**
 * Migration data: tạo SessionPlayer cho mọi pricing group đã tồn tại.
 *
 * Bối cảnh:
 * - Tính năng "pause theo từng người chơi" cần mỗi người là 1 row `SessionPlayer`
 *   (thuộc `SessionPricingGroup`, có pausedAt/totalPausedSeconds riêng).
 * - Các session cũ chỉ có `SessionPricingGroup.playerCount` (số người) — chưa có player rows.
 *
 * Cách xử lý:
 * - Với mỗi session ACTIVE + COMPLETED có `playerCount > 0`:
 *   tạo `group.playerCount` rows SessionPlayer (name = null → UI tự đánh số "Người N",
 *   pausedAt = null, totalPausedSeconds = 0).
 * - Phiên 1 người cũng tạo 1 row (nguồn dữ liệu đồng nhất); UI vẫn xử lý session-level.
 *
 * Idempotent: skip session đã có player rows. Chạy lại nhiều lần vẫn an toàn.
 *
 * Chạy: npm run migrate:session-players
 */
import 'dotenv/config'
import { prisma } from '@/lib/infrastructure/prisma'

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL chưa được cấu hình trong .env')
  }

  // ── 1. Lấy các session chưa có player rows (ACTIVE + COMPLETED) ──
  const sessions = await prisma.session.findMany({
    where: {
      playerCount: { gt: 0 },
      players: { none: {} },
      status: { in: ['ACTIVE', 'COMPLETED'] },
    },
    select: {
      id: true,
      playerCount: true,
      pricingGroups: {
        select: { id: true, playerCount: true },
        orderBy: { createdAt: 'asc' },
      },
    },
  })

  console.log(`Tìm thấy ${sessions.length} phiên cần backfill SessionPlayer`)

  let created = 0
  let skippedSessions = 0

  for (const session of sessions) {
    await prisma.$transaction(async (tx) => {
      // Kiểm tra lại trong transaction — tránh race khi chạy song song
      const alreadyHasPlayers = await tx.sessionPlayer.count({ where: { sessionId: session.id } })
      if (alreadyHasPlayers > 0) {
        skippedSessions += 1
        return
      }

      for (const group of session.pricingGroups) {
        const rows = Array.from({ length: group.playerCount }, () => ({
          sessionId: session.id,
          groupId: group.id,
          name: null,
          pausedAt: null,
          totalPausedSeconds: 0,
        }))
        if (rows.length === 0) continue
        await tx.sessionPlayer.createMany({ data: rows })
        created += rows.length
      }
    })
  }

  console.log('Hoàn tất:')
  console.log(`  - SessionPlayer đã tạo: ${created}`)
  console.log(`  - Phiên skip (đã có player rows): ${skippedSessions}`)
}

main()
  .catch((error) => {
    console.error('Migration thất bại:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
