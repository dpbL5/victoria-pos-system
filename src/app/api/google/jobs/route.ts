import { requireAdmin } from '@/lib/shared/auth'
import { repositories } from '@/lib/infrastructure/repositories'
import { apiError, apiSuccess, ERR_UNAUTHORIZED, ERR_FORBIDDEN } from '@/lib/infrastructure/api-helpers'
export async function GET() {
  try {
    await requireAdmin()
    const jobs = await repositories.calendarSync.list()
    return apiSuccess(await Promise.all(jobs.map(async j => {
      const entity = j.kind === 'SERIES' ? await repositories.lessonSeries.findById(j.entityId) : await repositories.lesson.findById(j.entityId)
      return { entityKey: j.entityKey, title: entity?.title ?? 'Lịch đã xoá', status: j.status, lastError: j.lastError, syncedAt: j.syncedAt }
    })))
  } catch (error) {
    const message = (error as Error).message
    return apiError(message === 'UNAUTHORIZED' ? ERR_UNAUTHORIZED : message === 'FORBIDDEN' ? ERR_FORBIDDEN : { code: 'UNKNOWN', message: 'Không tải được trạng thái đồng bộ', status: 500 })
  }
}
