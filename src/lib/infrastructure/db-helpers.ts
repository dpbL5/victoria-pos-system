// ── Transaction helpers — rollback semantics cho use-cases ─────
import { prisma } from './prisma'
import { createRepositories, type Repositories } from './repositories'
import type { DomainError, Result } from '@/lib/shared/result'
import { ok, err } from '@/lib/shared/result'
import type { Prisma } from '@/generated/prisma/client'

/**
 * RollbackSignal — ném bên trong $transaction callback để trigger rollback.
 *
 * LƯU Ý: Không dùng `return err()` trong transaction callback — Prisma sẽ
 * COMMIT các thay đổi trước đó. Muốn rollback phải throw → `fail()`.
 * Export để test dùng fake transaction runner bắt lỗi này.
 */
export class RollbackSignal {
  constructor(readonly error: DomainError) {}
}

/** Validation trong transaction (TOCTOU check, stock guard) → fail để rollback */
export function fail(code: string, detail?: string): never {
  throw new RollbackSignal({ code, detail })
}

/**
 * Chạy work trong $transaction, inject Repositories đã wrap store = tx.
 * - RollbackSignal (từ fail) → trả err(code, detail)
 * - Lỗi thật (DB, bug) → re-throw để route catch → 500
 *
 * options.isolationLevel — cho use-case cần isolation mạnh hơn (vd openOrJoinShift
 * dùng Serializable để tránh race mở ca).
 */
export async function runInTransaction<T>(
  work: (repos: Repositories) => Promise<T>,
  options?: { isolationLevel?: Prisma.TransactionIsolationLevel }
): Promise<Result<T>> {
  try {
    const value = options?.isolationLevel
      ? await prisma.$transaction(
          async (tx) => work(createRepositories(tx)),
          { isolationLevel: options.isolationLevel }
        )
      : await prisma.$transaction(async (tx) => work(createRepositories(tx)))
    return ok(value)
  } catch (error) {
    if (error instanceof RollbackSignal) return err(error.error.code, error.error.detail)
    throw error
  }
}
