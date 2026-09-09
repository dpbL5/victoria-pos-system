import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import type { GoogleCalendarPort } from '@/lib/students'
import { exchangeCodeForTokens, refreshAccessToken } from '@/lib/google'

function key() {
  const value = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY ?? ''
  if (!/^[a-fA-F0-9]{64}$/.test(value)) throw new Error('Cần cấu hình GOOGLE_TOKEN_ENCRYPTION_KEY gồm 64 ký tự hex')
  return Buffer.from(value, 'hex')
}

async function request(token: string, path: string, method = 'GET', body?: Record<string, unknown>) {
  const response = await fetch(`https://www.googleapis.com/calendar/v3/${path}`, {
    method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(8000),
  })
  if (!response.ok) throw Object.assign(new Error(`Google Calendar trả lỗi ${response.status}`), { status: response.status })
  return response.status === 204 ? null : response.json()
}
const eventsPath = (calendarId: string) => `calendars/${encodeURIComponent(calendarId)}/events`

export const googleCalendar: GoogleCalendarPort = {
  exchangeCode: exchangeCodeForTokens,
  refresh: refreshAccessToken,
  encrypt(value) {
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', key(), iv)
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
    return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), encrypted.toString('base64')].join(':')
  },
  decrypt(value) {
    // Token cũ được mã hoá lại ngay lần sử dụng đầu tiên, trước khi gọi Calendar.
    if (!value.startsWith('v1:')) return value
    const [, iv, tag, data] = value.split(':')
    const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'))
    decipher.setAuthTag(Buffer.from(tag, 'base64'))
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8')
  },
  async listCalendars(token) {
    const calendars: { id: string; summary: string; accessRole: string }[] = []
    let pageToken = ''
    do {
      const page = await request(token, `users/me/calendarList?minAccessRole=writer&maxResults=250${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`)
      calendars.push(...page.items)
      pageToken = page.nextPageToken ?? ''
    } while (pageToken)
    return calendars
  },
  async putEvent(token, calendarId, id, body) {
    const path = `${eventsPath(calendarId)}/${encodeURIComponent(id)}`
    try {
      await request(token, path, 'PATCH', body)
    } catch (error) {
      if ((error as { status?: number }).status !== 404) throw error
      try { await request(token, eventsPath(calendarId), 'POST', { ...body, id }) }
      catch (insertError) {
        if ((insertError as { status?: number }).status !== 409) throw insertError
        await request(token, path, 'PATCH', body)
      }
    }
    return id
  },
  async deleteEvent(token, calendarId, id) {
    try { await request(token, `${eventsPath(calendarId)}/${encodeURIComponent(id)}`, 'DELETE') }
    catch (error) { if (![404, 410].includes((error as { status: number }).status)) throw error }
  },
  async instance(token, calendarId, masterId, originalStartAt) {
    const params = new URLSearchParams({ originalStart: originalStartAt.toISOString(), showDeleted: 'true', maxResults: '250' })
    const page = await request(token, `${eventsPath(calendarId)}/${encodeURIComponent(masterId)}/instances?${params}`)
    const instance = page.items?.find((event: { originalStartTime?: { dateTime?: string } }) => Date.parse(event.originalStartTime?.dateTime ?? '') === originalStartAt.getTime())
    if (!instance) throw Object.assign(new Error('Chưa tìm thấy buổi trong chuỗi Google, sẽ thử lại'), { status: 503 })
    return instance.id
  },
}
