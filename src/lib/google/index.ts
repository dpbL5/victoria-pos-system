// ── Google domain — OAuth2 + Calendar API + sync ─────
export { getGoogleConfig } from './env'
export { buildAuthUrl, exchangeCodeForTokens, refreshAccessToken } from './oauth'
export type { TokenResponse } from './oauth'
export { createEvent, updateEvent, deleteEvent } from './calendar'
export type { CalendarEventInput } from './calendar'
export {
  syncLessonToCalendar,
  syncSeriesToCalendar,
  deleteCalendarEvent,
} from './sync'
export type { CalendarSyncResult } from './sync'
