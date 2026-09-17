import { timingSafeEqual } from 'node:crypto'
import { NextRequest } from 'next/server'
import { maintainCalendar, mapCalendarError } from '@/lib/students'
import { apiError, apiSuccess } from '@/lib/infrastructure/api-helpers'
export const runtime = 'nodejs'
export const maxDuration = 90
async function run(request: NextRequest) {
  const secret = process.env.CALENDAR_CRON_SECRET ?? process.env.CRON_SECRET ?? ''
  const expected = Buffer.from(`Bearer ${secret}`)
  const actual = Buffer.from(request.headers.get('authorization') ?? '')
  if (secret.length < 32 || actual.length !== expected.length || !timingSafeEqual(actual, expected)) return apiError({ code: 'UNAUTHORIZED', message: 'Không có quyền chạy đồng bộ', status: 401 })
  try {
    const result = await maintainCalendar(request.nextUrl.searchParams.get('recover') === '1')
    return result.ok ? apiSuccess(result.value) : apiError(mapCalendarError(result.error))
  } catch {
    return apiError({ code: 'CALENDAR_FAILED', message: 'Chưa hoàn tất tác vụ lịch, sẽ thử ở lượt tiếp theo', status: 500 })
  }
}
export const GET = run
export const POST = run
