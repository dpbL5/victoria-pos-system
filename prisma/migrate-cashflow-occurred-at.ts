/**
 * Migration data: đặt lại `occurred_at` cho khoản thu chi cũ bị nhảy ngày.
 *
 * Bối cảnh:
 * - `occurredAt` (ngày phát sinh) được thêm sau, khai báo NOT NULL @default(now()).
 * - Khi `prisma db push` thêm cột vào bảng ĐÃ CÓ dữ liệu, Postgres điền MỌI dòng
 *   cũ bằng thời điểm chạy ALTER → ngày phát sinh của bản ghi cũ nhảy về ngày push.
 *
 * Cách sửa: đặt `occurred_at = created_at` cho các dòng bị nhảy.
 * Điều kiện `occurred_at > created_at` là an toàn: bản ghi hợp lệ luôn có ngày
 * phát sinh ≤ ngày tạo (form chỉ cho chọn tới hôm nay), nên dòng nào có
 * occurred_at SAU created_at chắc chắn bị default ghi đè; dòng đã đúng giữ nguyên
 * (không đụng vào các bản ghi cố tình lùi ngày phát sinh).
 *
 * Idempotent: chạy lại nhiều lần vẫn an toàn.
 *
 * Chạy: npm run migrate:cashflow-occurred-at
 */
import dotenv from 'dotenv'

// Nạp env GIỐNG Next: .env.local ưu tiên hơn .env; biến đã export sẵn vẫn thắng.
// (import tĩnh prisma sẽ đọc env trước dotenv → phải import động trong main)
dotenv.config({ path: '.env.local' })
dotenv.config()

async function main() {
  const { prisma } = await import('@/lib/infrastructure/prisma')

  const host = (() => {
    try { return new URL(process.env.DATABASE_URL ?? '').host } catch { return 'unknown' }
  })()
  console.log(`DB đang sửa: ${host}`)

  const [before] = await prisma.$queryRaw<Array<{ total: number; wrong: number }>>`
    SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE occurred_at > created_at)::int AS wrong
    FROM app.cashflow_entries
  `
  console.log(`Tổng ${before.total} dòng — sai ngày (occurred_at > created_at): ${before.wrong}`)

  const updated = await prisma.$executeRaw`
    UPDATE app.cashflow_entries
    SET occurred_at = created_at
    WHERE occurred_at > created_at
  `
  console.log(`Đã đặt lại occurred_at = created_at cho ${updated} dòng`)
  console.log('Hoàn tất.')

  await prisma.$disconnect()
}

main().catch((error) => {
  console.error('Migration thất bại:', error)
  process.exit(1)
})
