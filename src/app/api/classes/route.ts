import { NextRequest } from 'next/server'
import { requireTrainingAccess } from '@/lib/shared/auth'
import { validateCSRF } from '@/lib/shared/csrf'
import { createClassSchema, createClass, listClasses, mapCreateClassError, parseSlotDates, type ClassSlotInput } from '@/lib/students'
import { apiSuccess, apiError, ERR_UNAUTHORIZED, ERR_FORBIDDEN, ERR_CSRF } from '@/lib/infrastructure/api-helpers'

export async function GET(request: NextRequest) {
  try {
    await requireTrainingAccess()
    const statusParam = request.nextUrl.searchParams.get('status')
    const status = statusParam === 'ACTIVE' || statusParam === 'ENDED' ? statusParam : undefined
    const classes = await listClasses({ status, search: request.nextUrl.searchParams.get('search') || undefined })
    return apiSuccess({ classes })
  } catch (error) {
    const message = (error as Error).message
    if (message === 'UNAUTHORIZED') return apiError(ERR_UNAUTHORIZED)
    if (message === 'FORBIDDEN') return apiError(ERR_FORBIDDEN)
    console.error('GET /api/classes error:', error)
    return apiError({ code: 'UNKNOWN', message: 'Không tải được danh sách lớp', status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireTrainingAccess()
    await validateCSRF(request)
    const parsed = createClassSchema.safeParse(await request.json())
    if (!parsed.success) return apiError({ code: 'VALIDATION', message: parsed.error.issues[0].message, status: 400 })

    const slots: ClassSlotInput[] = []
    for (const slot of parsed.data.slots ?? []) {
      const dates = parseSlotDates(slot)
      if (!dates || (dates.endsOn && slot.occurrenceCount)) return apiError({ code: 'VALIDATION', message: 'Chọn một cách kết thúc hợp lệ trong vòng 10 năm', status: 400 })
      slots.push({
        daysOfWeek: slot.daysOfWeek,
        startTime: slot.startTime,
        durationMin: slot.durationMin,
        intervalWeeks: slot.intervalWeeks,
        occurrenceCount: slot.occurrenceCount ?? null,
        startsOn: dates.startsOn,
        endsOn: dates.endsOn,
      })
    }

    const result = await createClass({
      staffId: auth.userId,
      name: parsed.data.name,
      coachName: parsed.data.coachName,
      note: parsed.data.note,
      studentIds: parsed.data.studentIds,
      slots,
    })
    if (!result.ok) return apiError(mapCreateClassError(result.error))
    return apiSuccess(result.value, 201)
  } catch (error) {
    const message = (error as Error).message
    if (message === 'UNAUTHORIZED') return apiError(ERR_UNAUTHORIZED)
    if (message === 'FORBIDDEN') return apiError(ERR_FORBIDDEN)
    if (message === 'CSRF_MISMATCH') return apiError(ERR_CSRF)
    if ((error as { code?: string }).code === 'P2034') return apiError({ code: 'CONFLICT', message: 'Dữ liệu vừa thay đổi. Hãy tải lại và thử lại', status: 409 })
    if ((error as { code?: string }).code === 'P2028') return apiError({ code: 'BUSY', message: 'Hệ thống đang bận. Hãy thử lại sau ít phút', status: 503 })
    console.error('POST /api/classes error:', error)
    return apiError({ code: 'UNKNOWN', message: 'Không tạo được lớp học', status: 500 })
  }
}
