import { NextRequest } from 'next/server'
import { requireTrainingAccess } from '@/lib/shared/auth'
import { validateCSRF } from '@/lib/shared/csrf'
import { classSlotSchema, createClassSlot, mapCreateClassSlotError, parseSlotDates } from '@/lib/students'
import { apiSuccess, apiError, ERR_UNAUTHORIZED, ERR_FORBIDDEN, ERR_CSRF } from '@/lib/infrastructure/api-helpers'

type Params = { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireTrainingAccess()
    await validateCSRF(request)
    const parsed = classSlotSchema.safeParse(await request.json())
    if (!parsed.success) return apiError({ code: 'VALIDATION', message: parsed.error.issues[0].message, status: 400 })
    const dates = parseSlotDates(parsed.data)
    if (!dates || (dates.endsOn && parsed.data.occurrenceCount)) return apiError({ code: 'VALIDATION', message: 'Chọn một cách kết thúc hợp lệ trong vòng 10 năm', status: 400 })

    const result = await createClassSlot({
      staffId: auth.userId,
      classId: (await params).id,
      daysOfWeek: parsed.data.daysOfWeek,
      startTime: parsed.data.startTime,
      durationMin: parsed.data.durationMin,
      intervalWeeks: parsed.data.intervalWeeks,
      occurrenceCount: parsed.data.occurrenceCount ?? null,
      startsOn: dates.startsOn,
      endsOn: dates.endsOn,
    })
    if (!result.ok) return apiError(mapCreateClassSlotError(result.error))
    return apiSuccess(result.value, 201)
  } catch (error) {
    const message = (error as Error).message
    if (message === 'UNAUTHORIZED') return apiError(ERR_UNAUTHORIZED)
    if (message === 'FORBIDDEN') return apiError(ERR_FORBIDDEN)
    if (message === 'CSRF_MISMATCH') return apiError(ERR_CSRF)
    if ((error as { code?: string }).code === 'P2034') return apiError({ code: 'CONFLICT', message: 'Dữ liệu vừa thay đổi. Hãy tải lại và thử lại', status: 409 })
    console.error('POST /api/classes/[id]/slots error:', error)
    return apiError({ code: 'UNKNOWN', message: 'Không thêm được khung giờ', status: 500 })
  }
}
