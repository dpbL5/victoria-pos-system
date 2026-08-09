import { NextRequest } from 'next/server'
import { requireAuth, requireMutationAuth } from '@/lib/shared/auth'
import { SETTING_KEYS, updateSetting, mapUpdateSettingError } from '@/lib/settings'
import { repositories } from '@/lib/infrastructure/repositories'
import { z } from 'zod'
import {
  apiSuccess,
  apiError,
  resultToResponse,
  ERR_UNAUTHORIZED,
  ERR_FORBIDDEN,
  ERR_CSRF,
} from '@/lib/infrastructure/api-helpers'

const updateSchema = z.object({
  key: z.string().min(1).max(100),
  value: z.string().min(1).max(255),
  label: z.string().max(200).optional(),
})

export async function GET(request: NextRequest) {
  try {
    await requireAuth()
    const key = request.nextUrl.searchParams.get('key')

    if (key) {
      const value = await repositories.settings.get(key)
      const row = await repositories.settings.getWithLabel(key)
      return apiSuccess({ key, value: value ?? '', label: row?.label ?? null })
    }

    const all = await repositories.settings.findAll()
    return apiSuccess(all)
  } catch (error) {
    const message = (error as Error).message
    if (message === 'UNAUTHORIZED') return apiError(ERR_UNAUTHORIZED)
    console.error('GET /api/settings error:', error)
    return apiError({ code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireMutationAuth(request)
    if (auth.role !== 'ADMIN') return apiError(ERR_FORBIDDEN)

    const body = await request.json()
    const parsed = updateSchema.safeParse(body)
    if (!parsed.success) {
      return apiError({ code: 'VALIDATION', message: parsed.error.issues[0].message, status: 400 })
    }

    if (!Object.values(SETTING_KEYS).includes(parsed.data.key as typeof SETTING_KEYS[keyof typeof SETTING_KEYS])) {
      return apiError({ code: 'VALIDATION', message: 'Không hỗ trợ cài đặt này', status: 400 })
    }

    const result = await updateSetting({
      staffId: auth.userId,
      key: parsed.data.key,
      value: parsed.data.value,
      label: parsed.data.label,
    })
    return resultToResponse(result, mapUpdateSettingError)
  } catch (error) {
    const message = (error as Error).message
    if (message === 'UNAUTHORIZED') return apiError(ERR_UNAUTHORIZED)
    if (message === 'CSRF_MISMATCH') return apiError(ERR_CSRF)
    console.error('PUT /api/settings error:', error)
    return apiError({ code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 })
  }
}
