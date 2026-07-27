// ── AppSettings helpers ─────────────────────────────────
import { prisma } from '@/lib/prisma'

// In-memory cache với TTL 60s — tránh đọc DB liên tục mỗi lần checkout
const cache = new Map<string, { value: string; expiresAt: number }>()
const CACHE_TTL_MS = 60_000

export async function getSetting(key: string): Promise<string | null> {
  const cached = cache.get(key)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value
  }

  const row = await prisma.appSetting.findUnique({ where: { key } })
  if (!row) return null

  cache.set(key, { value: row.value, expiresAt: Date.now() + CACHE_TTL_MS })
  return row.value
}

export async function getNumericSetting(key: string, defaultVal: number): Promise<number> {
  const val = await getSetting(key)
  if (val === null) return defaultVal
  const parsed = Number(val)
  return isNaN(parsed) ? defaultVal : parsed
}

export async function upsertSetting(key: string, value: string, label?: string): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key },
    update: { value, label },
    create: { key, value, label },
  })
  cache.delete(key)
}

export const SETTING_KEYS = {
  PARKING_FEE_UNIT_PRICE: 'PARKING_FEE_UNIT_PRICE',
} as const
