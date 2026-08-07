// ── Migration shim — Prisma client đã move vào infrastructure/ ─────
// Xóa file này khi tất cả consumer đã migrate sang repositories/ports (ADR-007)
export { prisma } from './infrastructure/prisma'
