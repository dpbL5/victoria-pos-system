import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/shared/auth'
import { validateCSRF } from '@/lib/shared/csrf'
import { updatePackageSchema } from '@/lib/students'
import { updatePackage, mapUpdatePackageError } from '@/lib/students'
import {
  apiSuccess,
  apiError,
  ERR_UNAUTHORIZED,
  ERR_FORBIDDEN,
  ERR_CSRF,
} from '@/lib/infrastructure/api-helpers'

type Params = { params: Promise<{ id: string; packageId: string }> }

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireAdmin()
    await validateCSRF(request)
    const { packageId } = await params
    const body = await request.json()
    const parsed = updatePackageSchema.safeParse(body)

    if (!parsed.success) {
      return apiError({ code: 'VALIDATION', message: parsed.error.issues[0].message, status: 400 })
    }

    const result = await updatePackage({
      staffId: auth.userId,
      packageId,
      name: parsed.data.name,
      total: parsed.data.total,
      isActive: parsed.data.isActive,
    })

    if (!result.ok) return apiError(mapUpdatePackageError(result.error))
    return apiSuccess(result.value)
  } catch (error) {
    const message = (error as Error).message
    if (message === 'UNAUTHORIZED') return apiError(ERR_UNAUTHORIZED)
    if (message === 'CSRF_MISMATCH') return apiError(ERR_CSRF)
    if (message === 'FORBIDDEN') return apiError(ERR_FORBIDDEN)
    console.error('PUT /api/students/[id]/packages/[packageId] error:', error)
    return apiError({ code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 })
  }
}
