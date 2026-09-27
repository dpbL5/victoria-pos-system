import { afterEach, describe, expect, it, vi } from 'vitest'
import { googleCalendar } from '@/lib/infrastructure/adapters/google-calendar-adapter'

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

describe('Google Calendar adapter', () => {
  it('mã hoá token và từ chối dữ liệu bị sửa', () => {
    vi.stubEnv('GOOGLE_TOKEN_ENCRYPTION_KEY', 'ab'.repeat(32))
    const encrypted = googleCalendar.encrypt('token-kiem-thu')
    expect(encrypted).not.toContain('token-kiem-thu')
    expect(googleCalendar.decrypt(encrypted)).toBe('token-kiem-thu')
    const parts = encrypted.split(':')
    parts[2] = Buffer.alloc(16).toString('base64')
    expect(() => googleCalendar.decrypt(parts.join(':'))).toThrow()
  })

  it('giữ event ID khi lần tạo trước đã thành công nhưng phản hồi bị mất', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 409 }))
      .mockResolvedValueOnce(Response.json({ id: 'ql123' }))
    vi.stubGlobal('fetch', fetchMock)
    expect(await googleCalendar.putEvent('token', 'clb@example.com', 'ql123', { summary: 'Buổi học' })).toBe('ql123')
    expect(fetchMock.mock.calls.map(call => call[1].method)).toEqual(['PATCH', 'POST', 'PATCH'])
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).id).toBe('ql123')
  })

  it('tìm buổi đã dời bằng giờ gốc của chuỗi', async () => {
    const original = new Date('2026-09-09T11:00:00Z')
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ items: [{ id: 'instance', originalStartTime: { dateTime: original.toISOString() } }] }))
    vi.stubGlobal('fetch', fetchMock)
    expect(await googleCalendar.instance('token', 'clb', 'master', original)).toBe('instance')
    expect(new URL(fetchMock.mock.calls[0][0]).searchParams.get('originalStart')).toBe(original.toISOString())
  })
})
