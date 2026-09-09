import { randomUUID } from 'node:crypto'
import { repositories, type Repositories } from '@/lib/infrastructure/repositories'
import { runInTransaction, fail } from '@/lib/infrastructure/db-helpers'
import { ok, err, type DomainError } from '@/lib/shared/result'
import type { HttpErrorInfo } from '@/lib/infrastructure/api-helpers'
import { DAY_MS, eventId, lessonEnd, SERIES_HORIZON_DAYS, weeklyOccurrences } from '../helpers/calendar'
import { ensureLessonsUntil } from './lesson-crud'

export async function calendarAccessToken(deps: Repositories = repositories) {
  const conn = await deps.calendarConnection.find()
  if (!conn) throw new Error('Chưa kết nối Google Calendar')
  const refreshToken = deps.googleCalendar.decrypt(conn.refreshToken)
  let accessToken = deps.googleCalendar.decrypt(conn.accessToken)
  let expiresAt = conn.tokenExpiresAt
  let nextRefresh = refreshToken
  if (expiresAt.getTime() < Date.now() + 30_000) {
    try {
      const tokens = await deps.googleCalendar.refresh(refreshToken)
      accessToken = tokens.access_token
      expiresAt = new Date(Date.now() + tokens.expires_in * 1000)
      nextRefresh = tokens.refresh_token ?? refreshToken
    } catch {
      await deps.calendarSync.reconnectRequired()
      throw Object.assign(new Error('Cần kết nối lại Google Calendar'), { status: 401 })
    }
  }
  const updated = await deps.calendarConnection.updateToken(conn.id, { accessToken: deps.googleCalendar.encrypt(accessToken), refreshToken: deps.googleCalendar.encrypt(nextRefresh), tokenExpiresAt: expiresAt }, conn.generation)
  return { conn: updated, accessToken }
}

function body(title: string, startsAt: Date, durationMin: number, description: string, entityId: string) {
  return {
    summary: title, description, status: 'confirmed',
    start: { dateTime: startsAt.toISOString(), timeZone: 'Asia/Ho_Chi_Minh' },
    end: { dateTime: lessonEnd({ startsAt, durationMin }).toISOString(), timeZone: 'Asia/Ho_Chi_Minh' },
    extendedProperties: { private: { qltruongcungId: entityId } },
  }
}

export async function processCalendarJobs(deps: Repositories = repositories) {
  const owner = randomUUID()
  if (!await deps.calendarSync.acquire(owner)) return ok({ processed: 0 })
  let processed = 0
  const deadline = Date.now() + 25_000
  try {
    const connection = await deps.calendarConnection.find()
    if (!connection?.calendarId || connection.needsReconnect) return ok({ processed })
    const { conn, accessToken } = await calendarAccessToken(deps)
    const calendarId = conn.calendarId!
    const jobs = await deps.calendarSync.pending()
    for (const job of jobs) {
      if (Date.now() > deadline) break
      if ((await deps.calendarConnection.find())?.generation !== conn.generation) break
      try {
        if (job.kind === 'SERIES') {
          const series = await deps.lessonSeries.findById(job.entityId)
          if (series) {
            const id = await deps.calendarSync.getMapping(job.entityKey, calendarId) ?? (series.googleCalendarId === calendarId && series.googleEventId ? series.googleEventId : eventId(series.id))
            const first = weeklyOccurrences(series, series.startsOn, new Date(series.startsOn.getTime() + 90 * DAY_MS))[0]
            if (!first || !series.isActive) {
              await deps.googleCalendar.deleteEvent(accessToken, calendarId, id)
            } else {
              await deps.googleCalendar.putEvent(accessToken, calendarId, id, { ...body(series.title, first, series.durationMin, series.coachName ? `HLV: ${series.coachName}` : '', series.id), recurrence: [series.rrule] })
              // Mapping chỉ đổi nếu bản nguồn vẫn là bản vừa gửi.
              const saved = await runInTransaction(async tx => {
                const current = await tx.lessonSeries.findById(series.id)
                if (current?.version !== series.version) return
                await tx.calendarSync.setMapping(job.entityKey, calendarId, id)
                await tx.lessonSeries.update(series.id, { googleEventId: id, googleCalendarId: calendarId }, series.version)
              })
              if (!saved.ok) throw new Error('Lịch đã thay đổi trong lúc đồng bộ')
            }
          }
        } else {
          const lesson = await deps.lesson.findById(job.entityId)
          if (lesson) {
            let id = await deps.calendarSync.getMapping(job.entityKey, calendarId) ?? (lesson.googleCalendarId === calendarId && lesson.googleEventId ? lesson.googleEventId : eventId(lesson.id))
            if (lesson.seriesId) {
              const series = await deps.lessonSeries.findById(lesson.seriesId)
              if (!series) throw new Error('Không tìm thấy chuỗi của buổi học')
              if (!series.isActive || (series.endsOn && (lesson.originalStartAt ?? lesson.startsAt) > series.endsOn)) {
                // Chuỗi đã cắt bỏ occurrence này; master được đồng bộ trước.
                const masterJob = (await deps.calendarSync.list([series.id]))[0]
                if (masterJob && masterJob.status !== 'SYNCED') throw Object.assign(new Error('Đang chờ đồng bộ chuỗi'), { status: 503 })
                await deps.calendarSync.finish(job.id, job.version)
                processed++
                continue
              }
              if (!series.googleEventId || series.googleCalendarId !== calendarId) {
                await deps.calendarSync.enqueue('SERIES', series.id)
                throw Object.assign(new Error('Đang chờ đồng bộ chuỗi'), { status: 503 })
              }
              id = await deps.googleCalendar.instance(accessToken, calendarId, series.googleEventId, lesson.originalStartAt ?? lesson.startsAt)
            }
            if (lesson.status === 'CANCELLED') await deps.googleCalendar.deleteEvent(accessToken, calendarId, id)
            else {
              const description = [lesson.coachName ? `HLV: ${lesson.coachName}` : '', lesson.shareNote ? lesson.note : ''].filter(Boolean).join('\n')
              await deps.googleCalendar.putEvent(accessToken, calendarId, id, body(lesson.title, lesson.startsAt, lesson.durationMin, description, lesson.id))
            }
            await runInTransaction(async tx => {
              await tx.calendarSync.setMapping(job.entityKey, calendarId, id)
              const current = await tx.lesson.findById(lesson.id)
              if (current?.version === lesson.version) await tx.lesson.update(lesson.id, { googleEventId: id, googleCalendarId: calendarId }, lesson.version)
            })
          }
        }
        await deps.calendarSync.finish(job.id, job.version)
        processed++
      } catch (error) {
        const status = (error as { status?: number }).status
        const reconnect = status === 401 || status === 403
        if (reconnect) await deps.calendarSync.reconnectRequired()
        const retry = !reconnect && (!status || status === 429 || status >= 500) && job.attempts < 8
        await deps.calendarSync.finish(job.id, job.version, { retry, attempts: job.attempts, message: reconnect ? 'Cần kết nối lại hoặc kiểm tra quyền ghi lịch Google' : (error instanceof Error ? error.message : 'Không đồng bộ được Google Calendar') })
        if (reconnect) break
      }
    }
    return ok({ processed })
  } catch (error) {
    return err('CALENDAR_SYNC_FAILED', error instanceof Error ? error.message : undefined)
  } finally {
    await deps.calendarSync.release(owner)
  }
}

export async function selectCalendar(input: { staffId: string; calendarId: string; confirmChange: boolean }, deps: Repositories = repositories) {
  const { conn, accessToken } = await calendarAccessToken(deps)
  const selected = (await deps.googleCalendar.listCalendars(accessToken)).find(c => c.id === input.calendarId)
  if (!selected) return err('CALENDAR_FORBIDDEN')
  if (conn.calendarId && conn.calendarId !== input.calendarId && !input.confirmChange) return err('CALENDAR_CONFIRM_CHANGE')
  return runInTransaction(async tx => {
    const current = await tx.calendarConnection.find()
    if (!current || current.generation !== conn.generation || (current.leaseUntil && current.leaseUntil > new Date())) fail('CALENDAR_BUSY')
    if (selected.primary) await tx.calendarSync.remapPrimary(input.calendarId)
    await tx.calendarConnection.upsert({ email: selected.summary, accessToken: conn.accessToken, refreshToken: conn.refreshToken, tokenExpiresAt: conn.tokenExpiresAt, calendarId: input.calendarId, generation: randomUUID(), needsReconnect: false })
    await tx.audit.append({ userId: input.staffId, action: 'GOOGLE_CALENDAR_SELECT', entityType: 'CalendarConnection', entityId: conn.generation, details: { calendarId: input.calendarId } })
    return { calendarId: input.calendarId }
  })
}

export async function retryCalendar(input: { staffId: string; from: Date; to: Date }, deps: Repositories = repositories) {
  const expanded = await ensureLessonsUntil(input.to, deps)
  if (!expanded.ok) return expanded
  return runInTransaction(async tx => {
    const conn = await tx.calendarConnection.find()
    if (!conn) fail('CALENDAR_NOT_CONNECTED')
    for (const series of await tx.lessonSeries.findMany()) await tx.calendarSync.enqueue('SERIES', series.id)
    const lessons = await tx.lesson.findManyBetween(input.from, input.to)
    const cancelled = await tx.lesson.findManyBetween(input.from, input.to, { status: 'CANCELLED' })
    for (const lesson of [...lessons, ...cancelled]) {
      if (!lesson.seriesId || lesson.isException || lesson.note) await tx.calendarSync.enqueue('LESSON', lesson.id)
    }
    await tx.calendarSync.retry()
    await tx.audit.append({ userId: input.staffId, action: 'GOOGLE_CALENDAR_RETRY', entityType: 'CalendarConnection', entityId: conn!.generation, details: { from: input.from.toISOString(), to: input.to.toISOString() } })
    return { queued: true }
  })
}

export async function maintainCalendar(deps: Repositories = repositories) {
  const expanded = await ensureLessonsUntil(new Date(Date.now() + SERIES_HORIZON_DAYS * DAY_MS), deps)
  const synced = await processCalendarJobs(deps)
  if (!synced.ok) return synced
  return ok({ ...synced.value, ...(expanded.ok ? {} : { warning: 'Chưa sinh tiếp được một chuỗi lịch. Kiểm tra trùng giờ và thử lại' }) })
}

export function mapCalendarError(error: DomainError): HttpErrorInfo {
  const messages: Record<string, string> = {
    CALENDAR_NOT_CONNECTED: 'Chưa kết nối Google Calendar', CALENDAR_FORBIDDEN: 'Không có quyền ghi lịch đã chọn', CALENDAR_CONFIRM_CHANGE: 'Cần xác nhận đổi lịch. Các sự kiện trên lịch cũ được giữ nguyên',
    CALENDAR_BUSY: 'Đang đồng bộ lịch. Hãy thử lại sau một phút', CALENDAR_SYNC_FAILED: 'Chưa đồng bộ được Google Calendar. Kiểm tra kết nối và thử lại',
  }
  return { code: error.code, message: messages[error.code] ?? 'Không cập nhật được Google Calendar', status: error.code === 'CALENDAR_SYNC_FAILED' ? 502 : 409 }
}

export async function retryLessonSync(input: { staffId: string; lessonId: string }, deps: Repositories = repositories) {
  void deps
  return runInTransaction(async tx => {
    const connection = await tx.calendarConnection.find()
    if (!connection?.calendarId) fail('CALENDAR_NOT_CONNECTED')
    const lesson = await tx.lesson.findById(input.lessonId)
    if (!lesson) fail('LESSON_NOT_FOUND')
    if (lesson!.seriesId) await tx.calendarSync.enqueue('SERIES', lesson!.seriesId)
    await tx.calendarSync.enqueue('LESSON', lesson!.id)
    await tx.audit.append({ userId: input.staffId, action: 'GOOGLE_CALENDAR_RETRY', entityType: 'Lesson', entityId: lesson!.id })
    return { queued: true }
  })
}
