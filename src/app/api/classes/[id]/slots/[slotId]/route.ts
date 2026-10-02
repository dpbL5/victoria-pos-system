import { NextRequest } from 'next/server'
import { requireTrainingAccess } from '@/lib/shared/auth'
import { validateCSRF } from '@/lib/shared/csrf'
import { updateClassSlotSchema, endClassSlotSchema, updateClassSlot, endClassSlot, mapUpdateClassSlotError } from '@/lib/students'
import { parseLocalDate, parseLocalDateEnd } from '@/lib/shared/utils'
import { apiSuccess, apiError, ERR_UNAUTHORIZED, ERR_FORBIDDEN, ERR_CSRF } from '@/lib/infrastructure/api-helpers'

type Params = { params: Promise<{ id: string; slotId: string }> }

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireTrainingAccess()
    await validateCSRF(request)
    const parsed = updateClassSlotSchema.safeParse(await request.json())
    if (!parsed.success) return apiError({ code: 'VALIDATION', message: parsed.error.issues[0].message, status: 400 })
    const { version, scope, startsOn, endsOn, occurrenceCount, ...rest } = parsed.data
    if (endsOn && occurrenceCount) return apiError({ code: 'VALIDATION', message: 'Chọn một cách kết thúc hợp lệ trong vòng 10 năm', status: 400 })
    const endsOnDate = typeof endsOn === 'string' ? parseLocalDateEnd(endsOn) : endsOn
    if (endsOnDate && Math.abs(endsOnDate.getTime() - Date.now()) > 10 * 366 * 86400000) {
      return apiError({ code: 'VALIDATION', message: 'Ngày kết thúc phải trong khoảng 10 năm', status: 400 })
    }

    const { id, slotId } = await params
    const result = await updateClassSlot({
      staffId: auth.userId,
      classId: id,
      slotId,
      version,
      scope,
      ...rest,
      ...(startsOn !== undefined ? { startsOn: parseLocalDate(startsOn) } : {}),
      ...(endsOn !== undefined ? { endsOn: endsOnDate } : {}),
      ...(occurrenceCount !== undefined ? { occurrenceCount } : {}),
    })
    if (!result.ok) return apiError(mapUpdateClassSlotError(result.error))
    return apiSuccess(result.value)
  } catch (error) {
    const message = (error as Error).message
    if (message === 'UNAUTHORIZED') return apiError(ERR_UNAUTHORIZED)
    if (message === 'FORBIDDEN') return apiError(ERR_FORBIDDEN)
    if (message === 'CSRF_MISMATCH') return apiError(ERR_CSRF)
    if ((error as { code?: string }).code === 'P2034') return apiError({ code: 'CONFLICT', message: 'Lịch vừa thay đổi. Hãy tải lại và thử lại', status: 409 })
    console.error('PATCH /api/classes/[id]/slots/[slotId] error:', error)
    return apiError({ code: 'UNKNOWN', message: 'Không lưu được khung giờ', status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireTrainingAccess()
    await validateCSRF(request)
    const parsed = endClassSlotSchema.safeParse(await request.json())
    if (!parsed.success) return apiError({ code: 'VALIDATION', message: parsed.error.issues[0].message, status: 400 })
    const { id, slotId } = await params
    const result = await endClassSlot({ staffId: auth.userId, classId: id, slotId, version: parsed.data.version, scope: parsed.data.scope })
    if (!result.ok) return apiError(mapUpdateClassSlotError(result.error))
    return apiSuccess(result.value)
  } catch (error) {
    const message = (error as Error).message
    if (message === 'UNAUTHORIZED') return apiError(ERR_UNAUTHORIZED)
    if (message === 'FORBIDDEN') return apiError(ERR_FORBIDDEN)
    if (message === 'CSRF_MISMATCH') return apiError(ERR_CSRF)
    if ((error as { code?: string }).code === 'P2034') return apiError({ code: 'CONFLICT', message: 'Lịch vừa thay đổi. Hãy tải lại và thử lại', status: 409 })
    console.error('DELETE /api/classes/[id]/slots/[slotId] error:', error)
    return apiError({ code: 'UNKNOWN', message: 'Không kết thúc được khung giờ', status: 500 })
  }
}
