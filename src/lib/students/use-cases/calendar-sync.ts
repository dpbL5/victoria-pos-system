import { randomUUID } from 'node:crypto'
import { repositories, type Repositories } from '@/lib/infrastructure/repositories'
import { runInTransaction, fail } from '@/lib/infrastructure/db-helpers'
import { ok, err, type DomainError } from '@/lib/shared/result'
import type { HttpErrorInfo } from '@/lib/infrastructure/api-helpers'
import type { CalendarConnectionRecord } from '../ports'
import { DAY_MS, eventId, lessonEnd, SERIES_HORIZON_DAYS, weeklyOccurrences } from '../helpers/calendar'
import { ensureLessonsUntil } from './lesson-crud'

/** Ngân sách thời gian cho một lượt bấm đồng bộ (route có maxDuration = 60s). */
const SYNC_BUDGET_MS = 45_000

export async function calendarAccessToken(userId: string, deps: Repositories = repositories) {
  const conn = await deps.calendarConnection.findByUser(userId)
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
      await deps.calendarSync.reconnectRequired(conn.id)
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

/**
 * Đẩy job của MỘT connection lên Google. Chỉ được gọi khi admin bấm đồng bộ —
 * không có vòng nền nào tự chạy, nên sửa lịch trong app sẽ không gọi Google.
 * Lặp 10 job/lần tới khi hết job của connection hoặc hết ngân sách thời gian.
 */
async function processConnectionJobs(connection: CalendarConnectionRecord, owner: string, deadline: number, deps: Repositories) {
  if (!await deps.calendarSync.acquire(connection.id, owner)) return { processed: 0 }
  let processed = 0
  try {
    const { conn, accessToken } = await calendarAccessToken(connection.userId, deps)
    if (!conn.calendarId || conn.needsReconnect) return { processed }
    const calendarId = conn.calendarId
    let stale = false
    while (!stale && Date.now() < deadline) {
      const jobs = await deps.calendarSync.pending(conn.id)
      if (!jobs.length) break
      for (const job of jobs) {
        if (Date.now() > deadline) break
        if ((await deps.calendarConnection.findById(conn.id))?.generation !== conn.generation) { stale = true; break }
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
                  const masterJob = (await deps.calendarSync.list(conn.id, [series.id]))[0]
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
                const description = [lesson.coachName ? `HLV: ${lesson.coachName}` : '', lesson.note].filter(Boolean).join('\n')
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
          if (reconnect) await deps.calendarSync.reconnectRequired(conn.id)
          const retry = !reconnect && (!status || status === 429 || status >= 500) && job.attempts < 8
          await deps.calendarSync.finish(job.id, job.version, { retry, attempts: job.attempts, message: reconnect ? 'Cần kết nối lại hoặc kiểm tra quyền ghi lịch Google' : (error instanceof Error ? error.message : 'Không đồng bộ được Google Calendar') })
          if (reconnect) { stale = true; break }
        }
      }
    }
    return { processed }
  } finally {
    await deps.calendarSync.release(connection.id, owner)
  }
}

/** Bấm đồng bộ: xử lý job của connection thuộc chính người bấm. */
export async function processCalendarJobsForUser(userId: string, deps: Repositories = repositories) {
  const connection = await deps.calendarConnection.findByUser(userId)
  if (!connection) return err('CALENDAR_NOT_CONNECTED')
  try {
    const { processed } = await processConnectionJobs(connection, randomUUID(), Date.now() + SYNC_BUDGET_MS, deps)
    const summary = await deps.calendarSync.summary(connection.id)
    return ok({ processed, remaining: summary.pending })
  } catch (error) {
    return err('CALENDAR_SYNC_FAILED', error instanceof Error ? error.message : undefined)
  }
}

export async function selectCalendar(input: { staffId: string; calendarId: string; confirmChange: boolean }, deps: Repositories = repositories) {
  const { conn, accessToken } = await calendarAccessToken(input.staffId, deps)
  const selected = (await deps.googleCalendar.listCalendars(accessToken)).find(c => c.id === input.calendarId)
  if (!selected) return err('CALENDAR_FORBIDDEN')
  if (conn.calendarId && conn.calendarId !== input.calendarId && !input.confirmChange) return err('CALENDAR_CONFIRM_CHANGE')
  return runInTransaction(async tx => {
    const current = await tx.calendarConnection.findByUser(input.staffId)
    if (!current || current.generation !== conn.generation || (current.leaseUntil && current.leaseUntil > new Date())) fail('CALENDAR_BUSY')
    if (selected.primary) await tx.calendarSync.remapPrimary(input.calendarId)
    await tx.calendarConnection.upsertForUser(input.staffId, { email: selected.summary, accessToken: conn.accessToken, refreshToken: conn.refreshToken, tokenExpiresAt: conn.tokenExpiresAt, calendarId: input.calendarId, generation: randomUUID(), needsReconnect: false })
    await tx.audit.append({ userId: input.staffId, action: 'GOOGLE_CALENDAR_SELECT', entityType: 'CalendarConnection', entityId: conn.generation, details: { calendarId: input.calendarId } })
    return { calendarId: input.calendarId }
  })
}

export async function retryCalendar(input: { staffId: string; from?: Date; to?: Date }, deps: Repositories = repositories) {
  const from = input.from ?? new Date(0)
  const to = input.to ?? new Date(Date.now() + SERIES_HORIZON_DAYS * DAY_MS)
  const expanded = await ensureLessonsUntil(to, deps)
  if (!expanded.ok) return expanded
  const queued = await runInTransaction(async tx => {
    const conn = await tx.calendarConnection.findByUser(input.staffId)
    if (!conn) fail('CALENDAR_NOT_CONNECTED')
    for (const series of await tx.lessonSeries.findMany()) await tx.calendarSync.enqueue('SERIES', series.id)
    const lessons = await tx.lesson.findManyBetween(from, to)
    const cancelled = await tx.lesson.findManyBetween(from, to, { status: 'CANCELLED' })
    for (const lesson of [...lessons, ...cancelled]) {
      if (!lesson.seriesId || lesson.isException || lesson.note) await tx.calendarSync.enqueue('LESSON', lesson.id)
    }
    await tx.calendarSync.retry(conn.id)
    await tx.audit.append({ userId: input.staffId, action: 'GOOGLE_CALENDAR_RETRY', entityType: 'CalendarConnection', entityId: conn.generation, details: { from: from.toISOString(), to: to.toISOString() } })
    return { queued: true }
  })
  if (!queued.ok) return queued
  return ok({ ...queued.value, ...await syncQueuedJobs(input.staffId, deps) })
}

/** Xử lý job ngay trong request của nút đồng bộ; `remaining` cho biết còn bao nhiêu mục chờ bấm tiếp. */
async function syncQueuedJobs(userId: string, deps: Repositories) {
  const synced = await processCalendarJobsForUser(userId, deps)
  return synced.ok
    ? { processed: synced.value.processed, remaining: synced.value.remaining }
    : { processed: 0, remaining: 0, syncError: mapCalendarError(synced.error).message }
}

/**
 * Cron chỉ sinh tiếp buổi học từ các chuỗi — KHÔNG đẩy job lên Google.
 * Lịch chỉ lên Google khi có admin bấm "Đồng bộ với Google Calendar".
 */
export async function maintainCalendar(deps: Repositories = repositories) {
  const expanded = await ensureLessonsUntil(new Date(Date.now() + SERIES_HORIZON_DAYS * DAY_MS), deps)
  return ok({ processed: 0, ...(expanded.ok ? {} : { warning: 'Chưa sinh tiếp được một chuỗi lịch. Kiểm tra trùng giờ và thử lại' }) })
}

export function mapCalendarError(error: DomainError): HttpErrorInfo {
  const messages: Record<string, string> = {
    CALENDAR_NOT_CONNECTED: 'Chưa kết nối Google Calendar', CALENDAR_FORBIDDEN: 'Không có quyền ghi lịch đã chọn', CALENDAR_CONFIRM_CHANGE: 'Cần xác nhận đổi lịch. Các sự kiện trên lịch cũ được giữ nguyên',
    CALENDAR_BUSY: 'Đang đồng bộ lịch. Hãy thử lại sau một phút', CALENDAR_SYNC_FAILED: 'Chưa đồng bộ được Google Calendar. Kiểm tra kết nối và thử lại',
  }
  return { code: error.code, message: messages[error.code] ?? 'Không cập nhật được Google Calendar', status: error.code === 'CALENDAR_SYNC_FAILED' ? 502 : 409 }
}
