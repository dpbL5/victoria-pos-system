// ── Ports — repository interface cho domain settings ─────
export interface SettingsRepository {
  get(key: string): Promise<string | null>
  getNumeric(key: string, defaultVal: number): Promise<number>
  upsert(key: string, value: string, label?: string): Promise<void>
  /** Setting + label — cho GET /api/settings?key= */
  getWithLabel(key: string): Promise<{ key: string; value: string; label: string | null } | null>
  /** Toàn bộ settings (orderBy key) — cho GET /api/settings */
  findAll(): Promise<Array<{ id: string; key: string; value: string; label: string | null; createdAt: Date; updatedAt: Date }>>
}

export const SETTING_KEYS = {
  PARKING_FEE_UNIT_PRICE: 'PARKING_FEE_UNIT_PRICE',
} as const
