// ── Adapter: implement SettingsRepository bằng Prisma (không cache) ─────
import type { SettingsStore } from '../store-types'
import type { SettingsRepository } from '@/lib/settings'

export function createSettingsRepository(store: SettingsStore): SettingsRepository {
  return {
    async get(key) {
      const row = await store.appSetting.findUnique({ where: { key } })
      return row ? row.value : null
    },

    async getNumeric(key, defaultVal) {
      const val = await this.get(key)
      if (val === null) return defaultVal
      const parsed = Number(val)
      return isNaN(parsed) ? defaultVal : parsed
    },

    async upsert(key, value, label) {
      await store.appSetting.upsert({
        where: { key },
        update: { value, label },
        create: { key, value, label },
      })
    },
  }
}
