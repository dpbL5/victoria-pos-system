// ── Settings helpers — cache wrapper (chỉ dùng ở composition root) ─────
import type { SettingsRepository } from './ports'

const CACHE_TTL_MS = 60_000

/**
 * Wrap SettingsRepository bằng in-memory cache 60s TTL — tránh đọc DB
 * liên tục mỗi lần checkout. Cache phải nằm ở composition root (wrapper
 * quanh singleton), KHÔNG trong per-tx adapter — mỗi transaction cần đọc
 * dữ liệu mới, không dùng cache cũ.
 */
export function createCachedSettingsRepository(
  inner: SettingsRepository
): SettingsRepository {
  const cache = new Map<string, { value: string; expiresAt: number }>()

  return {
    async get(key) {
      const cached = cache.get(key)
      if (cached && cached.expiresAt > Date.now()) {
        return cached.value
      }
      const value = await inner.get(key)
      if (value !== null) {
        cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS })
      }
      return value
    },

    async getNumeric(key, defaultVal) {
      const val = await this.get(key)
      if (val === null) return defaultVal
      const parsed = Number(val)
      return isNaN(parsed) ? defaultVal : parsed
    },

    async upsert(key, value, label) {
      await inner.upsert(key, value, label)
      cache.delete(key)
    },

    async getWithLabel(key) {
      const value = await this.get(key)
      if (value === null) return null
      return { key, value, label: null }
    },

    async findAll() {
      return inner.findAll()
    },
  }
}
