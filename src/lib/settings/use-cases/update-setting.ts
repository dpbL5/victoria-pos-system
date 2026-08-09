// ── Use-case: updateSetting — cập nhật cài đặt hệ thống ─────
import { err, ok } from '@/lib/shared/result'
import type { DomainError, Result } from '@/lib/shared/result'
import { runInTransaction } from '@/lib/infrastructure/db-helpers'
import type { HttpErrorInfo } from '@/lib/infrastructure/api-helpers'
import type { Repositories } from '@/lib/infrastructure/repositories'
import { repositories } from '@/lib/infrastructure/repositories'

export interface UpdateSettingInput {
  staffId: string
  key: string
  value: string
  label?: string
}

export interface UpdateSettingResult {
  key: string
  value: string
}

export async function updateSetting(
  input: UpdateSettingInput,
  deps: Repositories = repositories
): Promise<Result<UpdateSettingResult>> {
  const oldValue = await deps.settings.get(input.key)

  const result = await runInTransaction(async (tx) => {
    await tx.settings.upsert(input.key, input.value, input.label)

    await tx.audit.append({
      userId: input.staffId,
      action: 'SETTING_UPDATE',
      entityType: 'AppSetting',
      entityId: input.key,
      details: {
        key: input.key,
        oldValue: oldValue ?? '',
        newValue: input.value,
        label: input.label,
      },
    })

    return { key: input.key, value: input.value }
  })

  if (!result.ok) return result
  return ok(result.value)
}

export function mapUpdateSettingError(error: DomainError): HttpErrorInfo {
  return { code: error.code || 'UNKNOWN', message: error.detail || 'Lỗi máy chủ', status: 500 }
}
