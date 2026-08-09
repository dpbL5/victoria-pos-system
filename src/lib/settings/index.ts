// ── Settings module — AppSetting key-value ─────
export { createCachedSettingsRepository } from './helpers'
export { updateSetting, mapUpdateSettingError } from './use-cases/update-setting'
export type { UpdateSettingInput, UpdateSettingResult } from './use-cases/update-setting'
export type { SettingsRepository } from './ports'
export { SETTING_KEYS } from './ports'
