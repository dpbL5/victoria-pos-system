// ── Ports — repository interface cho domain settings ─────
export interface SettingsRepository {
  get(key: string): Promise<string | null>
  getNumeric(key: string, defaultVal: number): Promise<number>
  upsert(key: string, value: string, label?: string): Promise<void>
}

export const SETTING_KEYS = {
  PARKING_FEE_UNIT_PRICE: 'PARKING_FEE_UNIT_PRICE',
} as const
