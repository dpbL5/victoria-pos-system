// ── Client Google Calendar API v3 — server-side fetch (không cần googleapis) ─────

const CAL_BASE = 'https://www.googleapis.com/calendar/v3'

export interface CalendarEventInput {
  title: string
  startAt: Date
  durationMin: number
  description?: string
  /** RRULE như "FREQ=WEEKLY;BYDAY=MO,TH" → tạo recurring event. */
  recurrence?: string[]
}

async function request(
  accessToken: string,
  calendarId: string,
  path: string,
  init: { method?: string; body?: unknown } = {}
) {
  const res = await fetch(`${CAL_BASE}/calendars/${encodeURIComponent(calendarId)}/events${path}`, {
    method: init.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    const err = new Error(`GOOGLE_CALENDAR_API:${res.status}:${text}`)
    ;(err as Error & { status: number }).status = res.status
    throw err
  }

  return res.status === 204 ? null : res.json()
}

function toEventBody(input: CalendarEventInput) {
  return {
    summary: input.title,
    start: { dateTime: input.startAt.toISOString(), timeZone: 'Asia/Ho_Chi_Minh' },
    end: {
      dateTime: new Date(input.startAt.getTime() + input.durationMin * 60 * 1000).toISOString(),
      timeZone: 'Asia/Ho_Chi_Minh',
    },
    ...(input.description ? { description: input.description } : {}),
    ...(input.recurrence ? { recurrence: input.recurrence } : {}),
  }
}

export function createEvent(accessToken: string, calendarId: string, input: CalendarEventInput) {
  return request(accessToken, calendarId, '', {
    method: 'POST',
    body: toEventBody(input),
  }) as Promise<{ id: string }>
}

export function updateEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
  input: CalendarEventInput
) {
  return request(accessToken, calendarId, `/${eventId}`, {
    method: 'PATCH',
    body: toEventBody(input),
  }) as Promise<{ id: string }>
}

export function deleteEvent(accessToken: string, calendarId: string, eventId: string) {
  return request(accessToken, calendarId, `/${eventId}`, { method: 'DELETE' }) as Promise<unknown>
}
