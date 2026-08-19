// ── Sync buổi học → Google Calendar (best-effort) ─────
import { refreshAccessToken } from './oauth'
import { createEvent, updateEvent, deleteEvent } from './calendar'
import type { CalendarConnectionRecord } from '@/lib/students/ports'

export interface CalendarSyncResult {
  synced: boolean
  googleEventId?: string
  warning?: string
}

interface Session {
  accessToken: string
  refreshToken: string
  tokenExpiresAt: Date
  calendarId: string
  email: string
}

/** Lấy access token còn hạn (refresh nếu hết hạn). Trả null nếu không thể. */
async function ensureToken(conn: CalendarConnectionRecord): Promise<Session | null> {
  const now = Date.now()
  let accessToken = conn.accessToken

  if (conn.tokenExpiresAt.getTime() - 30_000 < now) {
    try {
      const refreshed = await refreshAccessToken(conn.refreshToken)
      accessToken = refreshed.access_token
      // ponytail: không cập nhật token mới vào DB trong sync (best-effort);
      // token cũ vẫn dùng được tới khi hết hạn, lần sau lại refresh. Add khi cần.
    } catch {
      return null
    }
  }

  return {
    accessToken,
    refreshToken: conn.refreshToken,
    tokenExpiresAt: conn.tokenExpiresAt,
    calendarId: conn.calendarId || 'primary',
    email: conn.email,
  }
}

function describeLesson(lesson: {
  title: string
  coachName?: string | null
  note?: string | null
  startsAt: Date
  durationMin: number
}) {
  const parts: string[] = []
  if (lesson.coachName) parts.push(`HLV: ${lesson.coachName}`)
  if (lesson.note) parts.push(lesson.note)
  return parts.join('\n') || undefined
}

/** Tạo hoặc cập nhật event cho 1 buổi lẻ. */
export async function syncLessonToCalendar(
  conn: CalendarConnectionRecord,
  lesson: Parameters<typeof describeLesson>[0] & { googleEventId?: string | null }
): Promise<CalendarSyncResult> {
  const session = await ensureToken(conn)
  if (!session) return { synced: false, warning: 'Không đồng bộ được Google Calendar' }

  try {
    const input = {
      title: lesson.title,
      startAt: lesson.startsAt,
      durationMin: lesson.durationMin,
      description: describeLesson(lesson),
    }

    if (lesson.googleEventId) {
      await updateEvent(session.accessToken, session.calendarId, lesson.googleEventId, input)
    } else {
      const created = await createEvent(session.accessToken, session.calendarId, input)
      return { synced: true, googleEventId: created.id }
    }
    return { synced: true, googleEventId: lesson.googleEventId }
  } catch {
    return { synced: false, warning: 'Không đồng bộ được Google Calendar' }
  }
}

/** Tạo recurring event cho 1 series. */
export async function syncSeriesToCalendar(
  conn: CalendarConnectionRecord,
  series: {
    title: string
    coachName?: string | null
    startsAt: Date
    durationMin: number
    rrule: string
    googleEventId?: string | null
  }
): Promise<CalendarSyncResult> {
  const session = await ensureToken(conn)
  if (!session) return { synced: false, warning: 'Không đồng bộ được Google Calendar' }

  try {
    const input = {
      title: series.title,
      startAt: series.startsAt,
      durationMin: series.durationMin,
      description: series.coachName ? `HLV: ${series.coachName}` : undefined,
      recurrence: [series.rrule],
    }

    if (series.googleEventId) {
      await updateEvent(session.accessToken, session.calendarId, series.googleEventId, input)
    } else {
      const created = await createEvent(session.accessToken, session.calendarId, input)
      return { synced: true, googleEventId: created.id }
    }
    return { synced: true, googleEventId: series.googleEventId }
  } catch {
    return { synced: false, warning: 'Không đồng bộ được Google Calendar' }
  }
}

/** Xoá event (cả recurring nếu là series). */
export async function deleteCalendarEvent(
  conn: CalendarConnectionRecord,
  googleEventId: string
): Promise<void> {
  const session = await ensureToken(conn)
  if (!session) return
  try {
    await deleteEvent(session.accessToken, session.calendarId, googleEventId)
  } catch {
    // best-effort: không ném
  }
}
